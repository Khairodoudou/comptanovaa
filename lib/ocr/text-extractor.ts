/**
 * Regex-based data extraction from OCR raw text.
 * Handles French, Arabic, and English invoice/document formats.
 *
 * CHANGELOG v2:
 * - Invoice number: patterns massively expanded (30+ formats)
 * - Cheque number: dedicated extractor with OCR-noise tolerance
 * - Both extractors: Arabic support, OCR misread tolerance (O/0, I/1, etc.)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedData {
  date: string | null;
  amount: number | null;
  amountHT: number | null;
  amountTVA: number | null;
  supplier: string | null;
  invoiceNumber: string | null;
  chequeNumber: string | null;       // ← NEW: dedicated cheque number field
  documentType: DocumentType;
  confidence: "high" | "medium" | "low";
  rawMatches: Record<string, string>;
}

export type DocumentType =
  | "FACTURE_FOURNISSEUR"
  | "FACTURE_CLIENT"
  | "BON_LIVRAISON"
  | "BON_RECEPTION"
  | "RELEVE_BANCAIRE"
  | "CHEQUE"
  | "AUTRE";

// ─── OCR noise normalization ──────────────────────────────────────────────────
// Tesseract often misreads: O↔0, I↔1, l↔1, S↔5, B↔8, etc.
// We normalize ONLY the candidate string, not the whole text.

function normalizeOcrNoise(s: string): string {
  return s
    .replace(/[oO]/g, "0")   // O → 0  (for pure-numeric parts)
    // We keep the original string AND the normalized one as candidates
    .trim();
}

// ─── Date patterns ────────────────────────────────────────────────────────────

const DATE_PATTERNS: RegExp[] = [
  /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/,
  /\b(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})\b/,
  /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2})\b/,
  /\b(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})\b/i,
  /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i,
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
    if (m[0].match(/^\d{4}/)) return `${m[1]}-${m[2]}-${m[3]}`;
    const monthStr = m[2]?.toLowerCase();
    const monthNum = FR_MONTHS[monthStr] ?? EN_MONTHS[monthStr] ?? AR_MONTHS[m[2]] ?? null;
    if (monthNum) {
      return `${m[3]}-${monthNum}-${m[1].padStart(2, "0")}`;
    }
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// ─── Amount patterns ──────────────────────────────────────────────────────────

const AMOUNT_PATTERNS: RegExp[] = [
  /([\d\s\u00a0]+(?:[,.]\d{1,2})?)[\s]*(?:DA|DZD|دج)/gi,
  /(?:DA|DZD|دج)[\s]*([\d\s\u00a0]+(?:[,.]\d{1,2})?)/gi,
  /([\d\s\u00a0]+(?:[,.]\d{1,2})?)[\s]*(?:€|EUR)/gi,
  /(?:€|EUR)[\s]*([\d\s\u00a0]+(?:[,.]\d{1,2})?)/gi,
  /([\d\s\u00a0]+(?:[,.]\d{1,2})?)[\s]*(?:\$|USD)/gi,
  /(?:TOTAL|MONTANT\s*(?:TTC|NET)?|NET\s*(?:À\s*PAYER)?|AMOUNT|المبلغ|الإجمالي)\s*:?\s*([\d\s\u00a0]{1,15}(?:[,.]\d{1,2})?)\s*(?:€|DA|DZD|\$|EUR)?/gi,
];

const TTC_PATTERNS: RegExp[] = [
  /[TY][\s.]*[TI][\s.]*C[\s.]*[:\s]*([\d\s.,]+)/gi,
  /NET[\s]*[AÀ][\s]*PAYER[\s]*[:\s]*([\d\s.,]+)/gi,
  /TOTAL[\s]*[TY][\s.]*[TI][\s.]*C[\s]*[:\s]*([\d\s.,]+)/gi,
  /MONTANT[\s]*[TY][\s.]*[TI][\s.]*C[\s]*[:\s]*([\d\s.,]+)/gi,
  /somme[\s]*(?:de)?[\s]*[:\s]*([\d\s.,]+)/gi,
];

const THT_PATTERNS: RegExp[] = [
  /[TY][\s.]*H[\s.]*[TI][\s]*[:\s]*([\d\s.,]+)/gi,
  /HORS[\s]*TAXES?[\s]*[:\s]*([\d\s.,]+)/gi,
  /TOTAL[\s]*H[\s.]*T[\s]*[:\s]*([\d\s.,]+)/gi,
  /MONTANT[\s]*H[\s.]*T[\s]*[:\s]*([\d\s.,]+)/gi,
  /BASE[\s]*(?:TVA|HT)[\s]*[:\s]*([\d\s.,]+)/gi,
];

const TVA_AMOUNT_PATTERNS: RegExp[] = [
  /T[\s.]*V[\s.]*A[\s]*(?:19|18)?[\s]*%?[\s]*[:\s]*([\d\s.,]+)/gi,
  /MONTANT[\s]*T[\s.]*V[\s.]*A[\s]*[:\s]*([\d\s.,]+)/gi,
  /TVA[\s]*\([\s]*\d+[\s]*%[\s]*\)[\s]*[:\s]*([\d\s.,]+)/gi,
];

function parseTVAAmount(text: string): number | null {
  for (const pattern of TVA_AMOUNT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m[1]) {
        const val = normalizeAmountStr(m[1]);
        if (val !== null && val > 0) return val;
      }
    }
  }
  return null;
}

function parseHTAmount(text: string): number | null {
  for (const pattern of THT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m[1]) {
        const val = normalizeAmountStr(m[1]);
        if (val !== null && val > 0) return val;
      }
    }
  }
  return null;
}

function normalizeAmountStr(raw: string): number | null {
  let s = raw.replace(/[\s\u00a0]/g, "").replace(/[^\d.,]+$/g, "").replace(/^[^\d]+/g, "");
  if (!s || s.length === 0) return null;
  if (s.match(/,\d{1,2}$/)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.match(/\.\d{1,2}$/)) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const val = parseFloat(s);
  if (!isNaN(val) && val > 0 && val < 100_000_000) return val;
  return null;
}

function parseAmount(text: string): number | null {
  for (const pattern of TTC_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m[1]) {
        const val = normalizeAmountStr(m[1]);
        if (val !== null && val > 0) return val;
      }
    }
  }
  for (const pattern of THT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m[1]) {
        const val = normalizeAmountStr(m[1]);
        if (val !== null && val > 0) {
          const tvaZero = /T[\s.]*V[\s.]*A[\s.]*[:\s]*0[,.]?0{0,2}/i.test(text);
          return tvaZero ? val : Math.round(val * 1.19 * 100) / 100;
        }
      }
    }
  }
  const candidates: number[] = [];
  for (const pattern of AMOUNT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[1] ?? match[0];
      const val = normalizeAmountStr(raw);
      if (val !== null) candidates.push(val);
    }
  }
  if (candidates.length > 0) return Math.max(...candidates);
  const allNumbers: number[] = [];
  const megaRegex = /(\d[\d\s.,]*\d)/g;
  let megaMatch: RegExpExecArray | null;
  while ((megaMatch = megaRegex.exec(text)) !== null) {
    const val = normalizeAmountStr(megaMatch[1]);
    if (val !== null && val >= 100) allNumbers.push(val);
  }
  if (allNumbers.length > 0) return Math.max(...allNumbers);
  return null;
}

// ─── Supplier / Client extraction ────────────────────────────────────────────

const RECIPIENT_MARKERS = /DESTINATAIRE|CLIENT|ACHETEUR|LIVR[EÉ]\s*[AÀ]|SHIP\s*TO|BILL\s*TO/i;

const SUPPLIER_PATTERNS: RegExp[] = [
  /(?:FOURNISSEUR|VENDEUR|EMETTEUR|ÉMETTEUR|FROM|DE LA PART DE|EMETTEUR)\s*:?\s*([^\n\r,]{3,80})/i,
  /(?:المورد|البائع|المصدر)\s*:?\s*([^\n\r,]{3,80})/,
  /\b((?:SARL|SPA|EURL|EI|SNC|EPIC|SARL-U|SAS)\s+[A-ZÀ-Úa-zà-ú0-9\s\-&'.]{2,60})/,
  /\b((?:S\.A\.R\.L|S\.P\.A|E\.U\.R\.L|S\.A\.S)\s+[A-ZÀ-Úa-zà-ú0-9\s\-&'.]{2,60})/,
  /(?:RAISON\s*SOCIALE|SOCIÉTÉ|ENTREPRISE|ETABLISSEMENT|GROUPE)\s*:?\s*([^\n\r,]{3,80})/i,
  /(?:الشركة|المؤسسة)\s*:?\s*([^\n\r,]{3,80})/,
];

function parseSupplier(text: string): string | null {
  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  for (const pattern of SUPPLIER_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const candidate = m[1].trim().replace(/\s+/g, ' ').substring(0, 80);
      const matchLine = lines.find(l => l.includes(candidate.substring(0, 15)));
      if (matchLine && RECIPIENT_MARKERS.test(matchLine)) continue;
      if (candidate.length >= 3) return candidate;
    }
  }
  for (const line of lines.slice(0, 15)) {
    if (/\b(SARL|SPA|EURL|EI|SNC|EPIC|SARL-U|SAS)\b/i.test(line)) {
      const idx = lines.indexOf(line);
      const prevLine = idx > 0 ? lines[idx - 1] : '';
      if (!RECIPIENT_MARKERS.test(line) && !RECIPIENT_MARKERS.test(prevLine)) {
        return line.substring(0, 80);
      }
    }
  }
  for (const line of lines.slice(0, 8)) {
    if (
      /^[A-ZÀ-Ü0-9\s\-&'.]{4,60}$/.test(line) &&
      !/^(FACTURE|INVOICE|DEVIS|BON|BON DE LIVRAISON|RELEV[EÉ]|TOTAL|MONTANT|DATE|R[EÉ]F[EÉ]RENCE|HEURE|N[°O]|QUINCAILLERIE|DROGUERIE|TEL|ADRESSE|DESIGNATION|QTE|PRIX|CHIFFRE)$/i.test(line.trim()) &&
      !RECIPIENT_MARKERS.test(line)
    ) {
      return line.trim().substring(0, 80);
    }
  }
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^(DE|FROM|PAR|ÉMIS PAR|EMIS PAR|VENDEUR)\s*:?$/i.test(lines[i])) {
      const next = lines[i + 1];
      if (next && next.length >= 3 && !/^\d+$/.test(next)) return next.substring(0, 80);
    }
  }
  for (const line of lines.slice(0, 10)) {
    if (
      /^[A-ZÀ-Ü][a-zà-ü]+(\s[A-ZÀ-Ü][a-zà-ü]+){1,3}$/.test(line) &&
      !/facture|invoice|total|date|montant|description|bon|livraison|devis/i.test(line) &&
      !RECIPIENT_MARKERS.test(line)
    ) {
      return line;
    }
  }
  return null;
}

// ─── Invoice Number — COMPLETELY REWRITTEN ────────────────────────────────────
//
// FORMATS HANDLED:
//   French:   Facture N° 2024-001 | N° 001 | Numéro: FA-2024/01 | Réf: INV-0099
//   Arabic:   فاتورة رقم 001 | رقم الفاتورة: 2024-001 | رقم: 0099
//   Coded:    FA-001 | FAC/2024/01 | INV-001 | F2024001 | FACT-001
//   Slash:    2024/001 | 2025/0099 | 01/2025
//   Dash:     2024-001 | FAC-2024-001
//   Prefixed: #001 | N.001 | N-001
//   OCR:      "N°" often becomes "N0" "N°" "NO" "N ° " "N. "
//
// STRATEGY:
//   1. Try label-anchored patterns first (highest confidence)
//   2. Try standalone coded patterns (FA-, INV-, etc.)
//   3. Try reference patterns (REF:, N°:)
//   4. Validate: min 3 chars, reject pure dates, reject amounts

// Characters allowed in an invoice number value
const INV_CHARS = "[A-Z0-9\\-\\/\\.]{2,30}";

const INVOICE_LABEL_PATTERNS: RegExp[] = [
  // ── French label anchors ────────────────────────────────────────────────
  // "Facture N°", "Facture No.", "Fact. N°", "FACT N°"
  /(?:FACTURES?|FACT\.?)\s*[N°NnOo°\.]{1,3}[\s°.]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,

  // "N°" / "N°." / "N°:" / "N ° " / "N0" (OCR misread) / "NO." / "Nº"
  // Followed directly by the invoice number (not a date, not a big amount)
  /\bN[\s°º\.]*[°oO0]?[\s]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,

  // "Numéro", "Numéro de facture", "Num.", "Numero"
  /(?:NUM[EÉ]RO|NUM\.?|NUMÉRO)\s*(?:DE\s*FACTURE)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,

  // "INVOICE", "INVOICE NO", "INVOICE #", "INV NO"
  /(?:INVOICE|INV\.?)\s*(?:NO\.?|N[°º]?|#|NUMBER)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,

  // "RÉFÉRENCE", "REF", "REF.", "Réf."
  /(?:R[EÉ]F[EÉ]RENCE|R[EÉ]F\.?)\s*(?:FACTURE)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,

  // ── Arabic label anchors ────────────────────────────────────────────────
  // "رقم الفاتورة: 001" | "فاتورة رقم 001" | "رقم: 001"
  /(?:رقم\s*الفاتورة|فاتورة\s*رقم|رقم\s*الوصل|رقم)\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/g,

  // Arabic digits version: "رقم: ٠٠١"
  /(?:رقم\s*الفاتورة|فاتورة\s*رقم|رقم)\s*:?\s*([\u0660-\u0669]{2,10})/g,

  // ── Bon de Livraison (BL) anchors ───────────────────────────────────────
  // "BL N°", "B.L.", "Bon de livraison", "B.L N°"
  /(?:B\.L\.?|BL|BON\s*DE\s*LIVRAISON|LIVRAISON)\s*[N°NnOo°\.]{0,3}[\s°.]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,
];

// Standalone coded patterns — no label needed, format alone is distinctive
const INVOICE_CODE_PATTERNS: RegExp[] = [
  // FA-001, FA-2024-001, FAC-001, FACT-001 (2-4 letter prefix, dash, digits)
  /\b(FA[CT]{0,2}[-\/]\d{2,}(?:[-\/]\d+)*)\b/gi,

  // INV-001, INV/2024/001
  /\b(INV[-\/]\d{2,}(?:[-\/]\d+)*)\b/gi,

  // F followed by 4+ digits (F2024001)
  /\b(F\d{4,})\b/gi,

  // Year/seq: 2024/001, 2025/0099 (year 20xx or 19xx, slash, 2-6 digits)
  /\b((?:19|20)\d{2}\/\d{2,6})\b/g,

  // seq/year: 001/2024
  /\b(\d{2,6}\/(?:19|20)\d{2})\b/g,

  // Hash-prefixed: #12345, #INV001
  /#([A-Z0-9]{3,20})\b/gi,
];

function cleanInvoiceCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[^A-Z0-9٠-٩]/i, "")   // strip leading non-alphanumeric
    .replace(/[^A-Z0-9\-\/\.٠-٩]+$/i, "") // strip trailing junk
    .toUpperCase();
}

function isValidInvoiceNumber(candidate: string): boolean {
  if (!candidate || candidate.length < 2) return false;

  // Reject pure dates (DD/MM/YYYY or YYYY-MM-DD)
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(candidate)) return false;
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(candidate)) return false;

  // Reject amounts (pure numbers > 1000 with no letters)
  if (/^\d+$/.test(candidate) && parseInt(candidate, 10) > 9999) return false;

  // Reject very short pure numbers (likely quantities, not invoice numbers)
  if (/^\d{1,2}$/.test(candidate)) return false;

  // An invoice number MUST contain at least one digit.
  // Pure letter strings like "EUF", "MBRE", "ADHAFNASSAWIL" are false positives.
  if (!/\d/.test(candidate)) return false;

  return true;
}

function parseInvoiceNumber(text: string): string | null {
  // ── Pass 1: label-anchored ────────────────────────────────────────────
  for (const pattern of INVOICE_LABEL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      const candidate = cleanInvoiceCandidate(raw);
      if (isValidInvoiceNumber(candidate)) {
        console.log(`[parseInvoiceNumber] label match: "${m[0]}" → "${candidate}"`);
        return candidate;
      }
    }
  }

  // ── Pass 2: standalone coded formats ─────────────────────────────────
  for (const pattern of INVOICE_CODE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const raw = m[1] ?? m[0];
      const candidate = cleanInvoiceCandidate(raw);
      if (isValidInvoiceNumber(candidate)) {
        console.log(`[parseInvoiceNumber] code match: "${m[0]}" → "${candidate}"`);
        return candidate;
      }
    }
  }

  console.log("[parseInvoiceNumber] No invoice number found.");
  return null;
}

// ─── Cheque Number — NEW DEDICATED EXTRACTOR ─────────────────────────────────
//
// FORMATS HANDLED:
//   French:   Chèque N° 123456 | Chèque no 123456 | N° Chèque: 123456
//             CHQ-001 | CHQ001 | Ch. N° 001 | Ordre de paiement N° 001
//   Arabic:   شيك رقم 123456 | رقم الشيك: 001 | شيك: 001
//   Bank CSV: CHQ001, CHQ-001 (already in the bank CSV format)
//   OCR:      "Chèque" often → "Cheque" "Ch.que" "Cheaue" "Ch6que" (OCR artifact)
//             "N°" → "N0" "NO" "N ° " as always

const CHEQUE_LABEL_PATTERNS: RegExp[] = [
  // "Chèque N° 123456" — tolerant to OCR noise on è and °
  // Ch[any 1-2 chars]que = handles "Chèque" "Cheque" "Ch.que" "Ch6que"
  /CH[A-ZÈEÊa-zèeê\.6]{1,3}QUE\s*[N°NnOo°\.\s]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,

  // "N° Chèque" / "No chèque" (label order reversed)
  /[N°NnOo°\.]{1,3}\s*[°\s]*CH[A-ZÈEÊa-zèeê\.6]{1,3}QUE\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,

  // "Numéro de chèque" / "Numéro chèque"
  /NUM[EÉ]RO\s*(?:DE\s*)?CH[A-Za-z\.6]{1,3}QUE\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,

  // "Ordre de paiement N°" (payment order = often tied to cheque)
  /ORDRE\s*(?:DE\s*)?PAIEMENT\s*[N°NnOo°\.\s]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,

  // "Virement N°" / "Virement chèque N°"
  /VIREMENT\s*(?:CH[A-Za-z]{1,3}QUE\s*)?[N°NnOo°\.\s]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,

  // Arabic: "شيك رقم", "رقم الشيك", "شيك:"
  /(?:شيك\s*رقم|رقم\s*الشيك|شيك)\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/g,

  // Arabic with Arabic-Indic digits: "شيك رقم ١٢٣٤٥٦"
  /(?:شيك\s*رقم|رقم\s*الشيك)\s*:?\s*([\u0660-\u0669]{4,12})/g,
];

// Standalone cheque code patterns
const CHEQUE_CODE_PATTERNS: RegExp[] = [
  // CHQ-001 | CHQ001 | CHQ/001 (common in bank CSVs and invoices)
  /\bCHQ[-\/]?([A-Z0-9]{2,20})\b/gi,

  // CQ-001 (abbreviated)
  /\bCQ[-\/]?([A-Z0-9]{2,20})\b/gi,

  // Pure digit cheque numbers: 6-12 digits in a row (bank cheque format)
  // But only when near the word "chèque" (handled in label pass above)
  // Standalone pure-digit: only if 7+ digits (typical bank cheque serial)
  /\b(\d{7,12})\b/g,
];

function normalizeArabicIndic(s: string): string {
  return s.replace(/[\u0660-\u0669]/g, (c) =>
    String(c.charCodeAt(0) - 0x0660)
  );
}

function cleanChequeCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[^A-Z0-9٠-٩]/i, "")
    .replace(/[^A-Z0-9\-\/٠-٩]+$/i, "")
    .toUpperCase();
}

function isValidChequeNumber(candidate: string): boolean {
  if (!candidate || candidate.length < 3) return false;
  // Reject dates
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(candidate)) return false;
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(candidate)) return false;
  // Must have at least 3 characters total
  return true;
}

function parseChequeNumber(text: string): string | null {
  // ── Pass 1: label-anchored (highest confidence) ───────────────────────
  for (const pattern of CHEQUE_LABEL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      // Convert Arabic-Indic digits if needed
      const normalized = normalizeArabicIndic(raw);
      const candidate = cleanChequeCandidate(normalized);
      if (isValidChequeNumber(candidate)) {
        console.log(`[parseChequeNumber] label match: "${m[0]}" → "${candidate}"`);
        return candidate;
      }
    }
  }

  // ── Pass 2: standalone CHQ-xxx codes ─────────────────────────────────
  const chqPattern = /\bCHQ[-\/]?([A-Z0-9]{2,20})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = chqPattern.exec(text)) !== null) {
    const candidate = cleanChequeCandidate(m[1]);
    if (isValidChequeNumber(candidate)) {
      console.log(`[parseChequeNumber] CHQ code match: "${m[0]}" → "${candidate}"`);
      return candidate;
    }
  }

  // ── Pass 3: 7-12 digit pure serial ONLY if "chèque/cheque/شيك" nearby ─
  // We search for the keyword, then look for digits within ±100 chars
  const chequeKeywordRe = /CH[A-Za-z\.6]{1,3}QUE|شيك/gi;
  let kw: RegExpExecArray | null;
  while ((kw = chequeKeywordRe.exec(text)) !== null) {
    const contextStart = Math.max(0, kw.index - 60);
    const contextEnd = Math.min(text.length, kw.index + kw[0].length + 80);
    const context = text.slice(contextStart, contextEnd);
    const digitRe = /\b(\d{6,12})\b/g;
    let dm: RegExpExecArray | null;
    while ((dm = digitRe.exec(context)) !== null) {
      const candidate = dm[1];
      if (isValidChequeNumber(candidate)) {
        console.log(`[parseChequeNumber] digit-near-keyword match: "${candidate}"`);
        return candidate;
      }
    }
  }

  console.log("[parseChequeNumber] No cheque number found.");
  return null;
}

// ─── Document type detection ──────────────────────────────────────────────────

const TYPE_KEYWORDS: Array<{ type: DocumentType; keywords: string[] }> = [
  {
    type: "BON_RECEPTION",
    keywords: ["bon de réception", "bon réception", "br n°", "وصل استلام", "bon de réce"],
  },
  {
    type: "BON_LIVRAISON",
    keywords: ["bon de livraison", "bon livraison", "delivery note", "bl n°", "livraison"],
  },
  {
    type: "RELEVE_BANCAIRE",
    keywords: ["relevé de compte", "bank statement", "extrait de compte", "كشف حساب", "solde initial", "solde final"],
  },
  {
    type: "CHEQUE",
    keywords: ["chèque", "cheque", "chq", "شيك", "ordre de paiement"],
  },
  {
    type: "FACTURE_FOURNISSEUR",
    keywords: ["facture fournisseur", "facture d'achat", "purchase invoice", "فاتورة شراء", "avoir fournisseur", "ticket de caisse", "reçu de paiement"],
  },
  {
    type: "FACTURE_CLIENT",
    keywords: ["facture", "invoice", "fact.", "f a c t u r e", "فاتورة", "quittance", "reçu", "ticket", "receipt", "note d'honoraire", "note"],
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
  if (data.date) score += 25;
  if (data.amount) score += 30;
  if (data.supplier) score += 15;
  if (data.invoiceNumber) score += 20;  // ← bumped: invoice N° is critical
  if (data.chequeNumber) score += 10;
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
  const chequeNumber = parseChequeNumber(rawText);     // ← NEW
  let documentType = detectDocumentType(rawText, filename);

  // Fallback heuristic: if it's AUTRE but we found a valid identifier
  if (documentType === "AUTRE") {
    if (invoiceNumber) {
      documentType = "FACTURE_CLIENT";
    } else if (chequeNumber) {
      documentType = "CHEQUE";
    }
  }

  let amountHT = parseHTAmount(rawText);
  let amountTVA = parseTVAAmount(rawText);

  if (amount && amountHT && !amountTVA) {
    amountTVA = Math.round((amount - amountHT) * 100) / 100;
  }
  if (amount && amountTVA && !amountHT) {
    amountHT = Math.round((amount - amountTVA) * 100) / 100;
  }
  if (amountHT && amount && amountHT >= amount) {
    amountHT = null;
    amountTVA = null;
  }

  const rawMatches: Record<string, string> = {};
  if (date) rawMatches.date = date;
  if (amount) rawMatches.amount = String(amount);
  if (amountHT) rawMatches.amountHT = String(amountHT);
  if (amountTVA) rawMatches.amountTVA = String(amountTVA);
  if (supplier) rawMatches.supplier = supplier;
  if (invoiceNumber) rawMatches.invoiceNumber = invoiceNumber;
  if (chequeNumber) rawMatches.chequeNumber = chequeNumber;     // ← NEW

  const partial = {
    date, amount, amountHT, amountTVA,
    supplier, invoiceNumber, chequeNumber,                       // ← NEW
    documentType, rawMatches,
  };
  const confidence = scoreConfidence(partial);

  return { ...partial, confidence };
}