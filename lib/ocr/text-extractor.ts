/**
 * Regex-based data extraction from OCR raw text.
 * Handles French, Arabic, and English invoice/document formats.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedData {
  date: string | null;
  amount: number | null;
  supplier: string | null;
  invoiceNumber: string | null;
  documentType: DocumentType;
  confidence: "high" | "medium" | "low";
  rawMatches: Record<string, string>;
}

export type DocumentType =
  | "FACTURE_FOURNISSEUR"
  | "FACTURE_CLIENT"
  | "BON_LIVRAISON"
  | "RELEVE_BANCAIRE"
  | "CHEQUE"
  | "AUTRE";

// ─── Date patterns ────────────────────────────────────────────────────────────

const DATE_PATTERNS: RegExp[] = [
  /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/,           // DD/MM/YYYY
  /\b(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})\b/,           // YYYY-MM-DD
  /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2})\b/,           // DD/MM/YY
  /\b(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})\b/i,
  /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i,
  // Arabic month names (romanized)
  /\b(\d{1,2})\s+(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\s+(\d{4})\b/,
];

const FR_MONTHS: Record<string, string> = {
  janvier: "01", février: "02", mars: "03", avril: "04",
  mai: "05", juin: "06", juillet: "07", août: "08",
  septembre: "09", octobre: "10", novembre: "11", décembre: "12",
};
const EN_MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};
const AR_MONTHS: Record<string, string> = {
  "يناير": "01", "فبراير": "02", "مارس": "03", "أبريل": "04",
  "مايو": "05", "يونيو": "06", "يوليو": "07", "أغسطس": "08",
  "سبتمبر": "09", "أكتوبر": "10", "نوفمبر": "11", "ديسمبر": "12",
};

function parseDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;

    // YYYY-MM-DD
    if (m[0].match(/^\d{4}/)) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }

    // Textual month (FR/EN/AR)
    const monthStr = m[2]?.toLowerCase();
    const monthNum = FR_MONTHS[monthStr] ?? EN_MONTHS[monthStr] ?? AR_MONTHS[m[2]] ?? null;
    if (monthNum) {
      const day = m[1].padStart(2, "0");
      return `${m[3]}-${monthNum}-${day}`;
    }

    // DD/MM/YYYY or DD/MM/YY
    const day = m[1];
    const month = m[2];
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

// ─── Amount patterns ──────────────────────────────────────────────────────────

const AMOUNT_PATTERNS: RegExp[] = [
  // With currency indicator — DA/DZD
  /(\d{1,3}(?:[\s\u00a0\.]?\d{3})*(?:[,\.]\d{1,2})?)\s*(?:DA|DZD|دج)/gi,
  /(?:DA|DZD|دج)\s*(\d{1,3}(?:[\s\u00a0\.]?\d{3})*(?:[,\.]\d{1,2})?)/gi,
  // EUR — "2 940 €" or "2940€" or "2.940,00 €"
  /(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[,\.]\d{1,2})?)\s*(?:€|EUR)/gi,
  /(?:€|EUR)\s*(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[,\.]\d{1,2})?)/gi,
  // USD
  /(\d{1,3}(?:[\s\u00a0\.]?\d{3})*(?:[,\.]\d{1,2})?)\s*(?:\$|USD)/gi,
  // After label keywords (TOTAL / MONTANT / NET À PAYER etc.)
  /(?:TOTAL|MONTANT\s*(?:TTC|NET)?|NET\s*(?:À\s*PAYER)?|AMOUNT|المبلغ|الإجمالي)\s*:?\s*([\d\s\u00a0]{1,15}(?:[,\.]\d{1,2})?)\s*(?:€|Ⓠ|DA|DZD|\$|EUR)?/gi,
];

function parseAmount(text: string): number | null {
  const candidates: number[] = [];

  for (const pattern of AMOUNT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[1] ?? match[0];
      // Normalize: remove spaces, convert comma decimal to dot
      const normalized = raw
        .replace(/\s/g, "")
        .replace(/\.(\d{3})/g, "$1")   // 1.234 → 1234 (thousand sep)
        .replace(/,(\d{1,2})$/, ".$1"); // 1234,56 → 1234.56
      const val = parseFloat(normalized);
      if (!isNaN(val) && val > 0 && val < 100_000_000) {
        candidates.push(val);
      }
    }
  }

  if (candidates.length === 0) return null;
  // Return the largest amount found (most likely to be the total)
  return Math.max(...candidates);
}

// ─── Supplier / Client extraction ────────────────────────────────────────────

const SUPPLIER_PATTERNS: RegExp[] = [
  /(?:FOURNISSEUR|VENDEUR|EMETTEUR|ÉMETTEUR|FROM|DE LA PART DE)\s*:?\s*([^\n\r,]{3,60})/i,
  /(?:المورد|البائع)\s*:?\s*([^\n\r,]{3,60})/,
  // Company legal forms
  /\b((?:SARL|SPA|EURL|EI|SNC|EPIC)\s+[A-ZÀ-Ú\w\s\-]{2,50})/,
  /\b((?:S\.A\.R\.L|S\.P\.A|E\.U\.R\.L)\s+[A-ZÀ-Ú\w\s\-]{2,50})/,
];

function parseSupplier(text: string): string | null {
  for (const pattern of SUPPLIER_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1].trim().substring(0, 80);
  }

  // Fallback 1: company form anywhere in text
  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (/\b(SARL|SPA|EURL|EI|SNC)\b/i.test(line)) {
      return line.substring(0, 80);
    }
  }

  // Fallback 2: First non-title line that looks like a person name
  // (e.g. "Célia Naudin" — Firstname Lastname, 2-3 words, no digits)
  for (const line of lines.slice(0, 6)) {
    if (
      /^[A-ZÀ-Ü][a-zà-ü]+(\s[A-ZÀ-Ü][a-zà-ü]+){1,2}$/.test(line) &&
      !/facture|invoice|total|date|montant|description/i.test(line)
    ) {
      return line;
    }
  }

  return null;
}

// ─── Invoice number ───────────────────────────────────────────────────────────

const INVOICE_NUMBER_PATTERNS: RegExp[] = [
  /(?:N°|NO\.|NUMÉRO|NUM\.?|FACTURE\s*N°?|INVOICE\s*(?:NO\.?|#)?|رقم الفاتورة)\s*:?\s*([A-Z0-9\-\/]{3,30})/gi,
  /\b(FA?-?\d{4,}(?:-\d+)*)\b/gi,
  /\b(INV-\d{4,}(?:-\d+)*)\b/gi,
  // Hash-prefixed: #12345
  /#(\d{3,})\b/g,
];

function parseInvoiceNumber(text: string): string | null {
  for (const pattern of INVOICE_NUMBER_PATTERNS) {
    const m = new RegExp(pattern.source, pattern.flags).exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

// ─── Document type detection ──────────────────────────────────────────────────

const TYPE_KEYWORDS: Array<{ type: DocumentType; keywords: string[] }> = [
  {
    type: "RELEVE_BANCAIRE",
    keywords: ["relevé de compte", "bank statement", "extrait de compte", "كشف حساب", "solde", "balance"],
  },
  {
    type: "CHEQUE",
    keywords: ["chèque", "cheque", "chq", "شيك", "ordre de paiement"],
  },
  {
    type: "BON_LIVRAISON",
    keywords: ["bon de livraison", "delivery note", "bl n°", "bon livraison", "وصل استلام"],
  },
  {
    type: "FACTURE_FOURNISSEUR",
    keywords: ["facture fournisseur", "facture d'achat", "purchase invoice", "فاتورة شراء", "avoir fournisseur"],
  },
  {
    type: "FACTURE_CLIENT",
    keywords: ["facture", "invoice", "fact.", "f a c t u r e", "فاتورة"],
  },
];

function detectDocumentType(text: string, filename: string): DocumentType {
  const haystack = `${text} ${filename}`.toLowerCase();

  for (const { type, keywords } of TYPE_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return type;
    }
  }
  return "AUTRE";
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

function scoreConfidence(data: Omit<ExtractedData, "confidence">): "high" | "medium" | "low" {
  let score = 0;
  if (data.date) score += 30;
  if (data.amount) score += 35;
  if (data.supplier) score += 20;
  if (data.invoiceNumber) score += 15;
  if (data.documentType !== "AUTRE") score += 10;

  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

// ─── Main extraction function ─────────────────────────────────────────────────

export function extractDocumentData(
  rawText: string,
  filename: string = ""
): ExtractedData {
  const date = parseDate(rawText);
  const amount = parseAmount(rawText);
  const supplier = parseSupplier(rawText);
  const invoiceNumber = parseInvoiceNumber(rawText);
  const documentType = detectDocumentType(rawText, filename);

  const rawMatches: Record<string, string> = {};
  if (date) rawMatches.date = date;
  if (amount) rawMatches.amount = String(amount);
  if (supplier) rawMatches.supplier = supplier;
  if (invoiceNumber) rawMatches.invoiceNumber = invoiceNumber;

  const partial = { date, amount, supplier, invoiceNumber, documentType, rawMatches };
  const confidence = scoreConfidence(partial);

  return { ...partial, confidence };
}
