/**
 * Regex-based data extraction from OCR raw text.
 * Handles French, Arabic, and English invoice/document formats.
 */

export interface ExtractedData {
  date: string | null;
  amount: number | null;
  amountHT: number | null;
  amountTVA: number | null;
  supplier: string | null;
  invoiceNumber: string | null;
  chequeNumber: string | null;
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

function normalizeOcrNoise(s: string): string {
  return s.replace(/[oO]/g, "0").trim();
}

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

// FIX 1: Enhanced amount normalization — handles 120.000,00 format
function normalizeAmountStr(raw: string): number | null {
  let s = raw.replace(/[\s\u00a0]/g, "").replace(/[^\d.,]+$/g, "").replace(/^[^\d]+/g, "");
  if (!s || s.length === 0) return null;

  // European format: 120.000,00 → 120000.00
  if (s.match(/\.\d{3}[,]\d{1,2}$/)) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // US format: 120,000.00 → 120000.00
  else if (s.match(/,\d{3}[.]\d{1,2}$/)) {
    s = s.replace(/,/g, "");
  }
  // Decimal comma: 120,00 → 120.00
  else if (s.match(/,\d{1,2}$/)) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Decimal dot: 120.00
  else if (s.match(/\.\d{1,2}$/)) {
    s = s.replace(/,/g, "");
  }
  // Thousands separator only (120.000 or 120,000)
  else if (s.match(/[.,]\d{3}$/)) {
    s = s.replace(/[.,]/g, "");
  }
  else {
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

// Labels that explicitly mark the emitter/vendor
const EMITTER_LABEL_PATTERNS: RegExp[] = [
  /(?:FOURNISSEUR|VENDEUR|EMETTEUR|ÉMETTEUR|DE LA PART DE|ÉMIS PAR|EMIS PAR)\s*:?\s*([^\n\r,]{3,80})/i,
  /(?:المورد|البائع|المصدر)\s*:?\s*([^\n\r,]{3,80})/,
  /(?:RAISON\s*SOCIALE|SOCIÉTÉ|ENTREPRISE|ETABLISSEMENT)\s*:?\s*([^\n\r,]{3,80})/i,
  /(?:الشركة|المؤسسة)\s*:?\s*([^\n\r,]{3,80})/,
];

// Labels that mark the RECIPIENT — must be skipped when looking for supplier
const RECIPIENT_LINE_RE = /^(DOIT|CLIENT|DESTINATAIRE|ACHETEUR|LIVRÉ\s*[AÀ]|FACTURÉ\s*[AÀ]|BILL\s*TO|SHIP\s*TO)\s*:/i;

// Noise words that are NOT company names
const NOT_A_NAME_RE = /^(FACTURE|INVOICE|DEVIS|BON|RELEV[EÉ]|TOTAL|MONTANT|DATE|R[EÉ]F[EÉ]RENCE|HEURE|N[°O]|QUINCAILLERIE|DROGUERIE|TEL|ADRESSE|DESIGNATION|QTE|PRIX|CHIFFRE|PAYEZ|CHEQUE|CHÈQUE|BANQUE|PAYABLE|RC|NIF|MF|ART|RIB|NRC|N°RC|N°MF|N°ART|ADRESSE|WILAYA|COMMUNE|TÉLÉPHONE|TELEPHONE|FAX|EMAIL|BP|PAGE|QUINCAILLERIE\s*DROGUERIE)$/i;

// Cheque / l'ordre de
const ORDRE_DE_RE = /(?:A\s*L['']ORDRE\s*DE|À\s*L['']ORDRE\s*DE|لأمر)\s*:?\s*([^\n\r,]{3,80})/i;

function cleanSupplierCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    // Stop at table headers / column titles
    .replace(/\s*(N[°º]\s*D[eé]signation|D[eé]signation|Quantit[eé]|Prix\s*Unit|Montant|Qt[eé]|Unit[eé]|P\.U\.|Réf\.?|Référence|Libellé|Description|Article|Code)(\s|$).*/i, '')
    // Stop at horizontal separators
    .replace(/\s*-{3,}.*/g, '')
    // Stop at cheque-specific phrases
    .replace(/\s*(Payable\s*[àa]|A\s*l['']ordre|payez|contre\s*ce\s*ch[eè]que|prière|zone\s*blanche).*/i, '')
    // Stop at address-like words
    .replace(/\s*(agence|bp|av\.|avenue|rue|cité|cite|wilaya|commune|BP\s*\d).*/i, '')
    // Remove leftover punctuation at end
    .replace(/[,;:\-–—]+$/, '')
    .substring(0, 80)
    .trim();
}

function parseSupplier(text: string, companyName: string = ""): string | null {
  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);

  const isUserCompany = (c: string): boolean => {
    if (!companyName || companyName.length < 3) return false;
    const cNorm = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cand  = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cand.includes(cNorm) || cNorm.includes(cand);
  };

  const isRecipientLine = (line: string): boolean => RECIPIENT_LINE_RE.test(line);
  const isNoiseLine = (line: string): boolean => NOT_A_NAME_RE.test(line.trim());

  // ── 1. Explicit cheque payee ──────────────────────────────────────────────
  const ordreMatch = text.match(ORDRE_DE_RE);
  if (ordreMatch?.[1]) {
    const cand = cleanSupplierCandidate(ordreMatch[1]);
    if (cand.length >= 3 && !isUserCompany(cand)) return cand;
  }

  // ── 2. Explicit emitter label patterns ───────────────────────────────────
  for (const pattern of EMITTER_LABEL_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const cand = cleanSupplierCandidate(m[1]);
      if (cand.length >= 3 && !isUserCompany(cand)) return cand;
    }
  }

  // ── 3. Legal-form company name anywhere in text ───────────────────────────
  const legalFormRe = /\b((?:SARL|SPA|EURL|EI|SNC|EPIC|SARL-U|SAS|S\.A\.R\.L|S\.P\.A|E\.U\.R\.L)\s+[A-ZÀ-Úa-zà-ú0-9\s\-&'.]{2,60})/g;
  let lm: RegExpExecArray | null;
  while ((lm = legalFormRe.exec(text)) !== null) {
    const cand = cleanSupplierCandidate(lm[1]);
    if (cand.length >= 3 && !isUserCompany(cand)) return cand;
  }

  // ── 4. First lines of document (company header) ───────────────────────────
  // In Algerian invoices the emitter name is always in the first 1-4 lines
  for (const line of lines.slice(0, 5)) {
    if (isRecipientLine(line)) break; // stop if we hit a recipient marker
    if (isNoiseLine(line)) continue;
    if (isUserCompany(line)) continue;
    // Must look like a proper name: all-caps, or Title Case, length 3-80
    if (
      /^[A-ZÀ-Ü0-9][A-ZÀ-Üa-zà-ü0-9\s\-&'.]{2,79}$/.test(line) &&
      line.length >= 3
    ) {
      const cand = cleanSupplierCandidate(line);
      if (cand.length >= 3 && !isUserCompany(cand)) return cand;
    }
  }

  // ── 5. Mixed-case company names in first 10 lines ─────────────────────────
  for (const line of lines.slice(0, 10)) {
    if (isRecipientLine(line)) continue;
    if (isNoiseLine(line)) continue;
    if (isUserCompany(line)) continue;
    if (
      /^[A-ZÀ-Ü][a-zà-ü]+(\s[A-ZÀ-Üa-zà-ü'\-]+){1,5}$/.test(line) &&
      !/facture|invoice|total|date|montant|description|bon|livraison|devis|payez|cheque|chèque|banque/i.test(line)
    ) {
      return cleanSupplierCandidate(line);
    }
  }
  return null;
}

const INVOICE_LABEL_PATTERNS: RegExp[] = [
  /(?:FACTURES?|FACT\.?)\s*[N°NnOo°\.]{1,3}[\s°.]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,
  /\bN[\s°º\.]*[°oO0]?[\s]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,
  /(?:NUM[EÉ]RO|NUM\.?|NUMÉRO)\s*(?:DE\s*FACTURE)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,
  /(?:INVOICE|INV\.?)\s*(?:NO\.?|N[°º]?|#|NUMBER)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,
  /(?:R[EÉ]F[EÉ]RENCE|R[EÉ]F\.?)\s*(?:FACTURE)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,
  /(?:رقم\s*الفاتورة|فاتورة\s*رقم|رقم\s*الوصل|رقم)\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/g,
  /(?:رقم\s*الفاتورة|فاتورة\s*رقم|رقم)\s*:?\s*([\u0660-\u0669]{2,10})/g,
  /(?:B\.L\.?|BL|BON\s*DE\s*LIVRAISON|LIVRAISON)\s*[N°NnOo°\.]{0,3}[\s°.]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{1,29})/gi,
];

const INVOICE_CODE_PATTERNS: RegExp[] = [
  /\b(FA[CT]{0,2}[-\/]\d{2,}(?:[-\/]\d+)*)\b/gi,
  /\b(INV[-\/]\d{2,}(?:[-\/]\d+)*)\b/gi,
  /\b(F\d{4,})\b/gi,
  /\b((?:19|20)\d{2}\/\d{2,6})\b/g,
  /\b(\d{2,6}\/(?:19|20)\d{2})\b/g,
  /#([A-Z0-9]{3,20})\b/gi,
];

function cleanInvoiceCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[^A-Z0-9٠-٩]/i, "")
    .replace(/[^A-Z0-9\-\/\.٠-٩]+$/i, "")
    .toUpperCase();
}

function isValidInvoiceNumber(candidate: string): boolean {
  if (!candidate || candidate.length < 2) return false;
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(candidate)) return false;
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(candidate)) return false;
  if (/^\d+$/.test(candidate) && parseInt(candidate, 10) > 9999) return false;
  if (/^\d{1,2}$/.test(candidate)) return false;
  if (!/\d/.test(candidate)) return false;
  return true;
}

function parseInvoiceNumber(text: string): string | null {
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

const CHEQUE_LABEL_PATTERNS: RegExp[] = [
  /CH[A-ZÈEÊa-zèeê\.6]{1,3}QUE\s*[N°NnOo°\.\s]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,
  /[N°NnOo°\.]{1,3}\s*[°\s]*CH[A-ZÈEÊa-zèeê\.6]{1,3}QUE\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,
  /NUM[EÉ]RO\s*(?:DE\s*)?CH[A-Za-z\.6]{1,3}QUE\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,
  /ORDRE\s*(?:DE\s*)?PAIEMENT\s*[N°NnOo°\.\s]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,
  /VIREMENT\s*(?:CH[A-Za-z]{1,3}QUE\s*)?[N°NnOo°\.\s]*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/gi,
  /(?:شيك\s*رقم|رقم\s*الشيك|شيك)\s*:?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,19})/g,
  /(?:شيك\s*رقم|رقم\s*الشيك)\s*:?\s*([\u0660-\u0669]{4,12})/g,
];

function normalizeArabicIndic(s: string): string {
  return s.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));
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
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(candidate)) return false;
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(candidate)) return false;
  return true;
}

function parseChequeNumber(text: string): string | null {
  for (const pattern of CHEQUE_LABEL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      const normalized = normalizeArabicIndic(raw);
      const candidate = cleanChequeCandidate(normalized);
      if (isValidChequeNumber(candidate)) {
        console.log(`[parseChequeNumber] label match: "${m[0]}" → "${candidate}"`);
        return candidate;
      }
    }
  }
  const chqPattern = /\bCHQ[-\/]?([A-Z0-9]{2,20})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = chqPattern.exec(text)) !== null) {
    const candidate = cleanChequeCandidate(m[1]);
    if (isValidChequeNumber(candidate)) {
      console.log(`[parseChequeNumber] CHQ code match: "${m[0]}" → "${candidate}"`);
      return candidate;
    }
  }
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
    keywords: ["chèque", "cheque", "chq", "شيك", "ordre de paiement", "payez contre", "a l'ordre de", "à l'ordre de"],
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

function detectDocumentType(text: string, filename: string, companyName: string = ""): DocumentType {
  const haystack = `${text} ${filename}`.toLowerCase();
  let baseType: DocumentType = "AUTRE";
  for (const { type, keywords } of TYPE_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      baseType = type;
      break;
    }
  }

  // Refine ambiguous "facture" matches
  if (baseType === "FACTURE_CLIENT" && companyName && companyName.length >= 3) {
    const cName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const lines = text.split(/[\n\r]+/).map(l => l.trim().toLowerCase());
    
    const recipientMarkers = ["doit", "client", "destinataire", "acheteur", "facturé à", "facture a"];
    let isUserRecipient = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (recipientMarkers.some(m => line.includes(m))) {
        // Check this line and the next line
        const combined = line + (lines[i+1] || "");
        if (combined.replace(/[^a-z0-9]/g, '').includes(cName)) {
          isUserRecipient = true;
          break;
        }
      }
    }
    
    let isUserEmitter = false;
    for (const line of lines.slice(0, 5)) {
      if (line.replace(/[^a-z0-9]/g, '').includes(cName)) {
        isUserEmitter = true;
        break;
      }
    }
    
    if (isUserRecipient) return "FACTURE_FOURNISSEUR";
    if (isUserEmitter) return "FACTURE_CLIENT";
    
    // Default to purchase invoice if ambiguous (most common case for manual uploads)
    return "FACTURE_FOURNISSEUR";
  }

  // If no company name is provided, default generic invoices to FOURNISSEUR
  if (baseType === "FACTURE_CLIENT" && haystack.includes("facture") && !haystack.includes("facture client")) {
    return "FACTURE_FOURNISSEUR";
  }

  return baseType;
}

function scoreConfidence(data: Omit<ExtractedData, "confidence">): "high" | "medium" | "low" {
  let score = 0;
  if (data.date) score += 25;
  if (data.amount) score += 30;
  if (data.supplier) score += 15;
  if (data.invoiceNumber) score += 20;
  if (data.chequeNumber) score += 10;
  if (data.documentType !== "AUTRE") score += 10;
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function extractDocumentData(
  rawText: string,
  filename: string = "",
  companyName: string = ""
): ExtractedData {
  const date = parseDate(rawText);
  const amount = parseAmount(rawText);
  const supplier = parseSupplier(rawText, companyName);
  const invoiceNumber = parseInvoiceNumber(rawText);
  const chequeNumber = parseChequeNumber(rawText);
  let documentType = detectDocumentType(rawText, filename, companyName);

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
  if (chequeNumber) rawMatches.chequeNumber = chequeNumber;

  const partial = {
    date, amount, amountHT, amountTVA,
    supplier, invoiceNumber, chequeNumber,
    documentType, rawMatches,
  };
  const confidence = scoreConfidence(partial);

  return { ...partial, confidence };
}
