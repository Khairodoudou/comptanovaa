import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { processBatch, BatchInput } from "@/lib/batch-processor";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

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

  const file1 = formData.get("file1") as File | null;
  const file2 = formData.get("file2") as File | null;
  const companyId = formData.get("companyId") as string | null;

  if (!file1 || !file2 || !companyId) {
    return NextResponse.json(
      { error: "file1, file2 and companyId are required" },
      { status: 400 }
    );
  }

  if (file1.size > MAX_SIZE || file2.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "One of the files is too large (max 10 MB)" },
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

  const arrayBuffer1 = await file1.arrayBuffer();
  const buffer1 = Buffer.from(arrayBuffer1);
  const arrayBuffer2 = await file2.arrayBuffer();
  const buffer2 = Buffer.from(arrayBuffer2);

  const input: BatchInput = {
    companyId,
    companyName: company.name,
    subAccounts,
    documents: [
      { filename: file1.name, buffer: buffer1, mimeType: file1.type || "application/octet-stream" },
      { filename: file2.name, buffer: buffer2, mimeType: file2.type || "application/octet-stream" },
    ],
  };

  // Traitement métier
  const result = await processBatch(input);

  // Si erreur de détection → on ne persiste rien (tout ou rien)
  if ("erreur" in result) {
    return NextResponse.json(result, { status: 422 });
  }

  const chequeFile = result.documents_detectes.find(d => d.type === "cheque");
  const factureFile = result.documents_detectes.find(d => d.type === "facture");
  if (!chequeFile || !factureFile) {
    return NextResponse.json({ erreur: true, code: "UNKNOWN_DOCUMENT", message: "Traitement échoué, documents manquants dans le résultat." }, { status: 422 });
  }

  const factureOriginalFile = file1.name === factureFile.nom_fichier ? file1 : file2;
  const chequeOriginalFile = file1.name === chequeFile.nom_fichier ? file1 : file2;

  // Récupérer le bon result OCR pour json
  // They are in the order [cheque, facture] based on batch-processor result
  const chequeOcrResult = result.ocr_results[0];
  const factureOcrResult = result.ocr_results[1];

  const docTypeFacture = factureFile.sous_type === "vente" ? "FACTURE_CLIENT" : "FACTURE_FOURNISSEUR";
  
  // Create date strings, falling back to current date
  const factureDate = result.facture_data.date ?? new Date().toISOString().split("T")[0];
  const chequeDate = result.cheque_data.date ?? factureDate;

  try {
    const factureBuffer = Buffer.from(await factureOriginalFile.arrayBuffer());
    const chequeBuffer = Buffer.from(await chequeOriginalFile.arrayBuffer());

    // Persistance atomique via transaction Prisma
    const savedDocs = await db.$transaction(async (tx) => {
      // Sauvegarder la facture avec ses écritures inchangées
      const fDoc = await tx.document.create({
        data: {
          filename: `${Date.now()}_${factureOriginalFile.name}`,
          originalName: factureOriginalFile.name,
          mimeType: factureOriginalFile.type || "application/octet-stream",
          size: factureOriginalFile.size,
          type: docTypeFacture,
          status: factureOcrResult.needsManualReview ? "UPLOADED" : "REVIEWED",
          companyId,
          fileBase64: factureBuffer.toString("base64"),
          ocrData: JSON.stringify({
            rawText: factureOcrResult.rawText.substring(0, 2000),
            extracted: result.facture_data,
            confidence: factureOcrResult.confidence,
            method: factureOcrResult.method,
            processingMs: factureOcrResult.processingMs,
          }),
        },
      });

      const fEntries = await Promise.all(
        result.ecritures_facture.map((spec) =>
          tx.journalEntry.create({
            data: {
              date: new Date(factureDate),
              description: spec.description,
              debitAccount: spec.debitAccount,
              creditAccount: spec.creditAccount,
              amount: spec.amount,
              reference: spec.reference,
              status: "PROPOSED",
              documentId: fDoc.id,
            },
          })
        )
      );

      // Sauvegarder le chèque avec ses écritures générées
      const cDoc = await tx.document.create({
        data: {
          filename: `${Date.now()}_${chequeOriginalFile.name}`,
          originalName: chequeOriginalFile.name,
          mimeType: chequeOriginalFile.type || "application/octet-stream",
          size: chequeOriginalFile.size,
          type: "CHEQUE",
          status: chequeOcrResult.needsManualReview ? "UPLOADED" : "REVIEWED",
          companyId,
          fileBase64: chequeBuffer.toString("base64"),
          ocrData: JSON.stringify({
            rawText: chequeOcrResult.rawText.substring(0, 2000),
            extracted: result.cheque_data,
            confidence: chequeOcrResult.confidence,
            method: chequeOcrResult.method,
            processingMs: chequeOcrResult.processingMs,
          }),
        },
      });

      const debitLine = result.ecritures_cheque.find(e => e.sens === "debit");
      const creditLine = result.ecritures_cheque.find(e => e.sens === "credit");
      
      let cEntry = null;
      if (debitLine && creditLine) {
        cEntry = await tx.journalEntry.create({
          data: {
            date: new Date(chequeDate),
            description: debitLine.libelle,
            debitAccount: debitLine.compte,
            creditAccount: creditLine.compte,
            amount: debitLine.montant,
            reference: result.cheque_data.chequeNumber ?? null,
            status: "PROPOSED",
            documentId: cDoc.id,
          },
        });
      }

      return { fDoc, fEntries, cDoc, cEntry };
    });

    const factureUploadResult = {
      document: {
        id: savedDocs.fDoc.id,
        originalName: savedDocs.fDoc.originalName,
        type: savedDocs.fDoc.type,
      },
      ocrResult: {
        date: factureDate,
        amountTTC: (result.facture_data.amount ?? 0).toFixed(2),
        amountHT:  (result.facture_data.amountHT ?? Math.round(((result.facture_data.amount ?? 0) / 1.19) * 100) / 100).toFixed(2),
        amountTVA: (result.facture_data.amountTVA ?? Math.round(((result.facture_data.amount ?? 0) - ((result.facture_data.amount ?? 0) / 1.19)) * 100) / 100).toFixed(2),
        htFromPDF: !!(result.facture_data.amountHT),
        tvaRate:   `19%`,
        supplier: result.facture_data.supplier ?? "Inconnu",
        reference: result.facture_data.invoiceNumber ?? "",
        type: docTypeFacture,
        confidence: factureOcrResult.confidence,
        needsManualReview: factureOcrResult.needsManualReview,
        method: factureOcrResult.method,
        processingMs: factureOcrResult.processingMs,
      },
      journalEntry: savedDocs.fEntries[0] ? {
        id: savedDocs.fEntries[0].id,
        description: savedDocs.fEntries[0].description,
        debitAccount: savedDocs.fEntries[0].debitAccount,
        creditAccount: savedDocs.fEntries[0].creditAccount,
        amount: savedDocs.fEntries[0].amount,
      } : null,
    };

    const chequeUploadResult = {
      document: {
        id: savedDocs.cDoc.id,
        originalName: savedDocs.cDoc.originalName,
        type: savedDocs.cDoc.type,
      },
      ocrResult: {
        date: chequeDate,
        amountTTC: (result.cheque_data.amount ?? result.facture_data.amount ?? 0).toFixed(2),
        amountHT:  (result.cheque_data.amount ?? result.facture_data.amount ?? 0).toFixed(2),
        amountTVA: "0.00",
        htFromPDF: false,
        tvaRate:   `0%`,
        supplier: result.facture_data.supplier ?? "Inconnu",
        reference: result.cheque_data.chequeNumber ?? "",
        type: "CHEQUE",
        confidence: chequeOcrResult.confidence,
        needsManualReview: chequeOcrResult.needsManualReview,
        method: chequeOcrResult.method,
        processingMs: chequeOcrResult.processingMs,
      },
      journalEntry: savedDocs.cEntry ? {
        id: savedDocs.cEntry.id,
        description: savedDocs.cEntry.description,
        debitAccount: savedDocs.cEntry.debitAccount,
        creditAccount: savedDocs.cEntry.creditAccount,
        amount: savedDocs.cEntry.amount,
      } : null,
    };

    Object.assign(result, { results: [factureUploadResult, chequeUploadResult] });


  } catch (err: any) {
    return NextResponse.json({ erreur: true, code: "DB_ERROR", message: "Failed to persist documents: " + err.message }, { status: 500 });
  }

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
    const needsReview = chequeOcrResult.needsManualReview || factureOcrResult.needsManualReview;
    const reviewNote = needsReview ? " ⚠ Révision manuelle recommandée" : "";
    await db.notification.create({
      data: {
        message: `Lot (Facture+Chèque) ajouté par ${user.name}${reviewNote}`,
        type: needsReview ? "warning" : "info",
        link: `/${comptableLang}/comptable/validate`,
        userId: comptableId,
      },
    });
  }

  return NextResponse.json(result, { status: 200 });
}
