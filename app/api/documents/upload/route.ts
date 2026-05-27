/**
 * POST /api/documents/upload
 * Upload a document, run professional OCR, create journal entries (PCN Algérien).
 *
 * Multi-entry accounting with TVA 19%:
 *   - FACTURE_FOURNISSEUR : Débit 380.x (HT) + Débit 44566 (TVA) / Crédit 401.x (TTC)
 *   - BON_RECEPTION       : Débit 30.x (stock) / Crédit 380.x (HT) — transfert stock
 *   - FACTURE_CLIENT      : Débit 411.x (TTC) / Crédit 700 (HT) + Crédit 44571 (TVA)
 *   - CHEQUE (émis)       : Débit 401.x / Crédit 512 — règlement fournisseur
 *   - RELEVE_BANCAIRE     : Débit 512 / Crédit 401.x
 *   - BON_LIVRAISON       : Débit 600 / Crédit 30.x — sortie de stock au coût d'achat
 *   - AUTRE/Charge        : Débit 607|626 + Débit 44566 / Crédit 401.x|512|53
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { runOcr } from "@/lib/ocr/professional-ocr";
import { generateEntries, TVA_RATE } from "@/lib/entry-generator";

export const runtime = "nodejs"; // Required for sharp + Tesseract


const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;

  if (!file || !companyId) {
    return NextResponse.json(
      { error: "File and companyId are required" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 10 MB)" },
      { status: 413 }
    );
  }

  // Validate company belongs to this user
  const company = await db.company.findFirst({
    where: { id: companyId, clientId: user.userId },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 403 });
  }

  const subAccounts = await db.subAccount.findMany({
    where: { companyId },
  });

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
      const fullResult = await runOcr(buffer, file.name, file.type);
      // Separate extracted data (OCR fields) from the processing metadata
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

  // ── Resolve document data ───────────────────────────────────────────────────
  const docType = extracted.documentType || "AUTRE";
  const amountTTC = extracted.amount ?? 0;
  const date = extracted.date ?? new Date().toISOString().split("T")[0];
  const supplier = extracted.supplier ?? "Inconnu";

  // Use HT/TVA from OCR if available; otherwise compute from TTC
  const computedHT  = Math.round((amountTTC / 1.19) * 100) / 100;
  const computedTVA = Math.round((amountTTC - computedHT) * 100) / 100;
  const htForEntries  = extracted.amountHT  ?? computedHT;
  const tvaForEntries = extracted.amountTVA ?? computedTVA;

  // Fix 2: for CHEQUE documents, use invoiceNumber as the cheque reference;
  // for all other documents, use invoiceNumber as the invoice reference.
  const refNumber: string | null =
    extracted.invoiceNumber ?? null;

  // ── Persist document ────────────────────────────────────────────────────────
  const document = await db.document.create({
    data: {
      filename: `${Date.now()}_${file.name}`,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: docType as
        | "FACTURE_FOURNISSEUR"
        | "FACTURE_CLIENT"
        | "BON_LIVRAISON"
        | "RELEVE_BANCAIRE"
        | "CHEQUE"
        | "AUTRE",
      status: ocrResult.needsManualReview ? "UPLOADED" : "REVIEWED",
      companyId,
      ocrData: JSON.stringify({
        rawText: ocrResult.rawText.substring(0, 2000),
        extracted,
        confidence: ocrResult.tesseractConfidence,
        method: ocrResult.method,
        processingMs: ocrResult.processingMs,
      }),
    },
  });

  // ── Auto-generate PROPOSED journal entries (multi-line, with TVA) ───────────
  // Pass raw OCR text as rawDesc so charge/payment-mode keywords are detected
  const rawDesc = ocrResult.rawText !== "MANUAL_ENTRY" ? ocrResult.rawText : supplier;
  const entrySpecs = generateEntries(docType, amountTTC, supplier, refNumber, rawDesc, subAccounts, htForEntries, tvaForEntries);

  const journalEntries = await Promise.all(
    entrySpecs.map((spec) =>
      db.journalEntry.create({
        data: {
          date: new Date(date),
          description: spec.description,
          debitAccount: spec.debitAccount,
          creditAccount: spec.creditAccount,
          amount: spec.amount,
          reference: spec.reference,
          status: "PROPOSED",
          documentId: document.id,
        },
      })
    )
  );

  // ── Notify assigned comptable ─────────────────────────────────────────────
  const companyWithComptable = await db.company.findUnique({
    where: { id: companyId },
    select: {
      comptable: { select: { id: true, preferredLang: true } },
    },
  });

  if (companyWithComptable?.comptable) {
    const { id: comptableId, preferredLang } = companyWithComptable.comptable;
    const comptableLang = preferredLang ?? "fr";
    const reviewNote = ocrResult.needsManualReview ? " ⚠ Révision manuelle recommandée" : "";
    await db.notification.create({
      data: {
        message: `Nouveau document "${file.name}" par ${user.name}${reviewNote}`,
        type: ocrResult.needsManualReview ? "warning" : "info",
        link: `/${comptableLang}/comptable/validate`,
        userId: comptableId,
      },
    });
  }

  // ── Compute HT/TVA for the response ─────────────────────────────────────────
  const htForResp  = htForEntries;
  const tvaForResp = tvaForEntries;

  // First entry for backward-compatible clients still reading `journalEntry`
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
        amountHT:  htForResp.toFixed(2),
        amountTVA: tvaForResp.toFixed(2),
        htFromPDF: !!(extracted.amountHT),  // true only if extracted from PDF
        tvaRate:   `${TVA_RATE * 100}%`,
        supplier,
        reference: refNumber ?? "",
        type: docType,
        confidence: ocrResult.tesseractConfidence,
        needsManualReview: ocrResult.needsManualReview,
        method: ocrResult.method,
        processingMs: ocrResult.processingMs,
      },
      // Full list of generated entries (one or two depending on doc type)
      journalEntries: journalEntries.map((e) => ({
        id: e.id,
        description: e.description,
        debitAccount: e.debitAccount,
        creditAccount: e.creditAccount,
        amount: e.amount,
        reference: e.reference,
      })),
      // Backward-compatible alias — always the first entry
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
