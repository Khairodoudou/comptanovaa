/**
 * POST /api/documents/upload
 * Upload a document (Client or Comptable), run OCR, create AI PROPOSED entries
 * with full traceability timestamps and JournalEntryVersion (AI_PROPOSAL).
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { runOcr } from "@/lib/ocr/professional-ocr";
import { generateEntries, TVA_RATE } from "@/lib/entry-generator";
import fs from "fs";
import path from "path";

export const runtime = "nodejs"; // sharp + Tesseract

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "CLIENT" && user.role !== "COMPTABLE")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Données de formulaire invalides" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;

  if (!file || !companyId) {
    return NextResponse.json(
      { error: "Le fichier et l'identifiant d'entreprise sont requis" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (max 10 Mo)" },
      { status: 413 }
    );
  }

  // Validate company permissions:
  // - If CLIENT: company.clientId === user.userId
  // - If COMPTABLE: company.comptableId === user.userId
  const company = await db.company.findFirst({
    where:
      user.role === "CLIENT"
        ? { id: companyId, clientId: user.userId }
        : { id: companyId, comptableId: user.userId },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Dossier entreprise introuvable ou accès refusé" },
      { status: 403 }
    );
  }

  const subAccounts = await db.subAccount.findMany({
    where: { companyId },
  });

  const ocrStartedAt = new Date();

  // ── Run OCR pipeline ────────────────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const manualOverride = formData.get("manualOverride") === "true";
  let ocrResult: {
    rawText: string;
    tesseractConfidence: number;
    needsManualReview: boolean;
    processingMs: number;
    method: string;
  };
  let extracted: {
    documentType?: string;
    amount?: number;
    amountHT?: number;
    amountTVA?: number;
    date?: string;
    supplier?: string;
    invoiceNumber?: string;
  } = {};

  if (!manualOverride) {
    try {
      const fullResult = await runOcr(buffer, file.name, file.type, company.name);
      extracted = fullResult.extracted as typeof extracted;
      ocrResult = {
        rawText:             fullResult.rawText,
        tesseractConfidence: fullResult.tesseractConfidence,
        needsManualReview:   fullResult.needsManualReview,
        processingMs:        fullResult.processingMs,
        method:              fullResult.method,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Impossible de lire ce document.";
      return NextResponse.json(
        { error: "OCR_FAILED", message: msg, confidence: 0 },
        { status: 422 }
      );
    }
  } else {
    extracted = {
      documentType: formData.get("type") as string,
      amount: parseFloat(formData.get("amount") as string),
      date: formData.get("date") as string,
      supplier: formData.get("supplier") as string,
      invoiceNumber: formData.get("invoiceNumber") as string,
    };
    ocrResult = {
      rawText: "MANUAL_ENTRY",
      tesseractConfidence: 100,
      needsManualReview: false,
      processingMs: 0,
      method: "manual",
    };
  }

  const ocrFinishedAt = new Date();
  const aiProposedAt = new Date();

  // ── Resolve document data ───────────────────────────────────────────────────
  const docType = extracted.documentType || "AUTRE";
  const amountTTC = extracted.amount ?? 0;
  const date = extracted.date ?? new Date().toISOString().split("T")[0];
  const supplier = extracted.supplier ?? "Inconnu";

  const computedHT  = Math.round((amountTTC / 1.19) * 100) / 100;
  const computedTVA = Math.round((amountTTC - computedHT) * 100) / 100;
  const htForEntries  = extracted.amountHT  ?? computedHT;
  const tvaForEntries = extracted.amountTVA ?? computedTVA;
  const refNumber: string | null = extracted.invoiceNumber ?? null;

  // ── Persist file to disk (public/uploads) ──────────────────────────────────
  const uniqueFilename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  try {
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadsDir, uniqueFilename), buffer);
  } catch (fsErr) {
    console.warn("Could not save physical file to disk:", fsErr);
  }

  // ── Persist document with Full Traceability ─────────────────────────────────
  const document = await db.document.create({
    data: {
      filename: uniqueFilename,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: docType as any,
      status: ocrResult.needsManualReview ? "UPLOADED" : "REVIEWED",
      companyId,
      uploadedById: user.userId,
      uploadedByRole: user.role,
      ocrStartedAt,
      ocrFinishedAt,
      aiProposedAt,
      fileBase64: buffer.toString("base64"),
      ocrData: JSON.stringify({
        rawText: ocrResult.rawText.substring(0, 2000),
        extracted,
        confidence: ocrResult.tesseractConfidence,
        method: ocrResult.method,
        processingMs: ocrResult.processingMs,
      }),
    },
  });

  // ── Auto-create Invoice record if FACTURE ───────────────────────────────────
  if ((docType === "FACTURE_CLIENT" || docType === "FACTURE_FOURNISSEUR" || docType.includes("FACTURE")) && amountTTC > 0) {
    try {
      await db.invoice.create({
        data: {
          companyId,
          documentId: document.id,
          invoiceNumber: refNumber || `FAC-${Date.now().toString().slice(-6)}`,
          amount: amountTTC,
          status: "UNPAID",
          description: `${docType === "FACTURE_CLIENT" ? "Facture Client" : "Facture Fournisseur"} - ${supplier}`,
        },
      });
    } catch (e) {
      console.error("Auto invoice creation error:", e);
    }
  }

  // ── Generate PROPOSED journal entries + JournalEntryVersion (AI_PROPOSAL) ──
  const rawDesc = ocrResult.rawText !== "MANUAL_ENTRY" ? ocrResult.rawText : supplier;
  const entrySpecs = generateEntries(docType, amountTTC, supplier, refNumber, rawDesc, subAccounts, htForEntries, tvaForEntries);

  const journalEntries = await Promise.all(
    entrySpecs.map(async (spec) => {
      const entry = await db.journalEntry.create({
        data: {
          date: new Date(date),
          description: spec.description,
          debitAccount: spec.debitAccount,
          creditAccount: spec.creditAccount,
          amount: spec.amount,
          reference: spec.reference,
          status: "PROPOSED",
          source: "AI",
          companyId,
          documentId: document.id,
          sentToClient: false,
        },
      });

      // Save initial AI Proposal Version (Never to be overwritten)
      await db.journalEntryVersion.create({
        data: {
          journalEntryId: entry.id,
          versionNumber: 1,
          versionType: "AI_PROPOSAL",
          actorType: "AI",
          debitAccount: spec.debitAccount,
          creditAccount: spec.creditAccount,
          amount: spec.amount,
          description: spec.description,
          reference: spec.reference,
          reason: "Proposition automatique IA basée sur extraction OCR",
        },
      });

      return entry;
    })
  );

  // ── Audit Log ───────────────────────────────────────────────────────────────
  await db.auditLog.create({
    data: {
      action: "DOCUMENT_UPLOADED_AI_PROPOSED",
      entityType: "Document",
      entityId: document.id,
      companyId,
      userId: user.userId,
      newValue: JSON.stringify({
        filename: file.name,
        type: docType,
        amountTTC,
        entriesCount: journalEntries.length,
        uploadedByRole: user.role,
      }),
      comment: `Document déposé par ${user.role} (${user.name}) - ${journalEntries.length} écritures générées par IA`,
    },
  });

  // ── Notify assigned comptable if uploaded by Client ─────────────────────────
  if (user.role === "CLIENT") {
    const companyWithComptable = await db.company.findUnique({
      where: { id: companyId },
      select: { comptable: { select: { id: true, preferredLang: true } } },
    });

    if (companyWithComptable?.comptable) {
      const { id: comptableId, preferredLang } = companyWithComptable.comptable;
      const comptableLang = preferredLang ?? "fr";
      const reviewNote = ocrResult.needsManualReview ? " ⚠ Révision manuelle recommandée" : "";
      await db.notification.create({
        data: {
          message: `Nouveau document "${file.name}" déposé par ${user.name}${reviewNote}`,
          type: ocrResult.needsManualReview ? "warning" : "info",
          link: `/${comptableLang}/comptable/validate`,
          userId: comptableId,
        },
      });
    }
  }

  const firstEntry = journalEntries[0];

  return NextResponse.json(
    {
      document: {
        id: document.id,
        originalName: document.originalName,
        type: document.type,
      },
      ocrResult: {
        date,
        amountTTC: amountTTC.toFixed(2),
        amountHT:  htForEntries.toFixed(2),
        amountTVA: tvaForEntries.toFixed(2),
        htFromPDF: !!(extracted.amountHT),
        tvaRate:   `${TVA_RATE * 100}%`,
        supplier,
        reference: refNumber ?? "",
        type: docType,
        confidence: ocrResult.tesseractConfidence,
        needsManualReview: ocrResult.needsManualReview,
        method: ocrResult.method,
        processingMs: ocrResult.processingMs,
      },
      journalEntries: journalEntries.map((e) => ({
        id: e.id,
        description: e.description,
        debitAccount: e.debitAccount,
        creditAccount: e.creditAccount,
        amount: e.amount,
        reference: e.reference,
        status: e.status,
      })),
      journalEntry: {
        id: firstEntry.id,
        description: firstEntry.description,
        debitAccount: firstEntry.debitAccount,
        creditAccount: firstEntry.creditAccount,
        amount: firstEntry.amount,
      },
    },
    { status: 201 }
  );
}
