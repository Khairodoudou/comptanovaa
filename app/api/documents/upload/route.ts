/**
 * POST /api/documents/upload
 * Upload a document, run professional OCR, create journal entries (PCG Algérien).
 *
 * Multi-entry accounting with TVA 19%:
 *   - FACTURE_FOURNISSEUR : 380 (HT) + 44566 (TVA) → 401 (TTC)
 *   - FACTURE_CLIENT      : 411 (TTC) → 700 (HT) + 44571 (TVA)
 *   - CHEQUE              : 401 → 512  (no TVA on payment; reference = cheque number)
 *   - RELEVE_BANCAIRE     : 512 → 401
 *   - BON_LIVRAISON/AUTRE : 607 (HT) + 44566 (TVA) → 401 (TTC)
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { runOcr } from "@/lib/ocr/professional-ocr";

export const runtime = "nodejs"; // Required for sharp + Tesseract

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const TVA_RATE = 0.19;

// ─── Multi-entry accounting rules (PCG Algérien) ──────────────────────────────

interface EntrySpec {
  debitAccount: string;
  creditAccount: string;
  amount: number;
  description: string;
  reference: string | null;
}

// ── 3.1 Helper: derive a short numeric sub-account suffix from supplier name ──
// e.g. "SARL DUPONT" → "001", "Air Algérie" → "002" (deterministic, 3 digits)
function supplierSuffix(supplier: string): string {
  let hash = 0;
  for (let i = 0; i < supplier.length; i++) {
    hash = (hash * 31 + supplier.charCodeAt(i)) & 0xffffff;
  }
  // Keep in range 1–999 and zero-pad to 3 digits
  const n = (hash % 999) + 1;
  return n.toString().padStart(3, "0");
}

// ── 3.3 Helper: detect charge account (607 goods vs 626 services) ─────────────
// 626 = frais postaux, téléphone, publicité, honoraires, transport, internet
const SERVICE_KEYWORDS =
  /t[eé]l[eé]phone|internet|abonnement|honoraires?|publicit[eé]|transport|poste|courrier|assurance|locat|maint|conseil|formation|nettoyage|gardiennage/i;

function chargeAccount(description: string): "607" | "626" {
  return SERVICE_KEYWORDS.test(description) ? "626" : "607";
}

// ── 3.3 Helper: detect credit account (401 supplier credit vs 512 bank vs 531 cash) ─
// If description mentions virement / prélèvement / banque → 512
// If it mentions espèces / caisse / liquide → 531
// Default: 401 (supplier credit — paid later)
const BANK_KEYWORDS = /virement|pr[eé]l[eè]vement|banque|CB|carte/i;
const CASH_KEYWORDS = /esp[eè]ces?|caisse|liquide|cash/i;

function creditForCharge(description: string): "401" | "512" | "531" {
  if (BANK_KEYWORDS.test(description)) return "512";
  if (CASH_KEYWORDS.test(description)) return "531";
  return "401";
}

/**
 * Generates one or more journal entry specifications for a document.
 *
 * @param docType     Detected document type (FACTURE_FOURNISSEUR, CHEQUE, …)
 * @param amountTTC   Total amount including VAT (TTC), as extracted by OCR
 * @param supplier    Supplier / client name for description + sub-account suffix
 * @param refNumber   Invoice or cheque number for the reference field
 * @param rawDesc     Raw OCR description — used to detect charge type and payment mode
 */
function generateEntries(
  docType: string,
  amountTTC: number,
  supplier: string,
  refNumber: string | null,
  rawDesc: string = ""
): EntrySpec[] {
  // Round to 2 decimal places to avoid floating-point drift
  const ht  = Math.round((amountTTC / (1 + TVA_RATE)) * 100) / 100;
  const tva = Math.round((amountTTC - ht) * 100) / 100;

  const label  = supplier || "Inconnu";
  // Fix 3.1: sub-account suffix derived from supplier name (deterministic)
  const suffix = supplierSuffix(label);

  switch (docType) {
    // ── Achat marchandises ─────────────────────────────────────────────────
    // Fix 3.1: 380.xxx (stock HT) + 44566 (TVA déductible) → 401.xxx (TTC)
    case "FACTURE_FOURNISSEUR":
      return [
        {
          debitAccount:  `380.${suffix}`,
          creditAccount: `401.${suffix}`,
          amount: ht,
          description: `Achat marchandises HT — ${label}`,
          reference: refNumber,
        },
        {
          debitAccount:  "44566",
          creditAccount: `401.${suffix}`,
          amount: tva,
          description: `TVA déductible 19% — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Vente ──────────────────────────────────────────────────────────────
    // Fix 3.1: 411.xxx (TTC) → 700 (HT) + 44571 (TVA collectée)
    // Fix 3.2: + déstockage: 607 (coût marchandises) → 380.xxx (stock)
    case "FACTURE_CLIENT":
      return [
        {
          debitAccount:  `411.${suffix}`,
          creditAccount: "700",
          amount: ht,
          description: `Vente HT — ${label}`,
          reference: refNumber,
        },
        {
          debitAccount:  `411.${suffix}`,
          creditAccount: "44571",
          amount: tva,
          description: `TVA collectée 19% — ${label}`,
          reference: refNumber,
        },
        // Fix 3.2 — Déstockage: sortie de stock au coût d'achat
        {
          debitAccount:  "607",
          creditAccount: `380.${suffix}`,
          amount: ht,
          description: `Déstockage marchandises — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Chèque / Paiement ──────────────────────────────────────────────────
    // Fix 3.1: 401.xxx → 512 (banque). reference = cheque number from OCR.
    case "CHEQUE":
      return [
        {
          debitAccount:  `401.${suffix}`,
          creditAccount: "512",
          amount: amountTTC,
          description: `Paiement chèque — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Relevé bancaire ────────────────────────────────────────────────────
    case "RELEVE_BANCAIRE":
      return [
        {
          debitAccount:  "512",
          creditAccount: `401.${suffix}`,
          amount: amountTTC,
          description: `Mouvement bancaire — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Bon de livraison ───────────────────────────────────────────────────
    // Fix 3.3: 607 vs 626 detected from description; credit 401/512/531
    case "BON_LIVRAISON": {
      const chargeAcc = chargeAccount(rawDesc || label);
      const creditAcc = creditForCharge(rawDesc || label);
      const credit    = creditAcc === "401" ? `401.${suffix}` : creditAcc;
      return [
        {
          debitAccount:  chargeAcc,
          creditAccount: credit,
          amount: ht,
          description: `Livraison HT — ${label}`,
          reference: refNumber,
        },
        {
          debitAccount:  "44566",
          creditAccount: credit,
          amount: tva,
          description: `TVA déductible 19% — ${label}`,
          reference: refNumber,
        },
      ];
    }

    // ── Charges générales / Autre ──────────────────────────────────────────
    // Fix 3.3: auto-detect 607 vs 626; auto-detect 401 / 512 / 531
    default: {
      const chargeAcc = chargeAccount(rawDesc || label);
      const creditAcc = creditForCharge(rawDesc || label);
      const credit    = creditAcc === "401" ? `401.${suffix}` : creditAcc;
      return [
        {
          debitAccount:  chargeAcc,
          creditAccount: credit,
          amount: ht,
          description: `Charge HT — ${label}`,
          reference: refNumber,
        },
        {
          debitAccount:  "44566",
          creditAccount: credit,
          amount: tva,
          description: `TVA déductible 19% — ${label}`,
          reference: refNumber,
        },
      ];
    }
  }
}


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
  const entrySpecs = generateEntries(docType, amountTTC, supplier, refNumber, rawDesc);

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
  const ht  = Math.round((amountTTC / (1 + TVA_RATE)) * 100) / 100;
  const tva = Math.round((amountTTC - ht) * 100) / 100;

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
        amountHT:  ht.toFixed(2),
        amountTVA: tva.toFixed(2),
        tvaRate:   `${TVA_RATE * 100}%`,
        supplier,
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
