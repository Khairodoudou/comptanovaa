/**
 * Regex-based data extraction from OCR raw text.
 * Handles French, Arabic, and English invoice/document formats.
 */

export interface ExtractedData {
  date: string | null;
  chequeDate: string | null;
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

export interface CompanyContext {
  name: string;
  raisonSociale?: string | null;
  nif?: string | null;
  nrc?: string | null;
  regimeFiscal?: string | null;
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

// Enhanced amount normalization — handles European & Algerian formats
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

  // Reject Algerian telephone numbers: 05/06/07/02/03/04 followed by 7-8 digits (e.g. 0550123456)
  if (/^0[2-7]\d{7,8}$/.test(s) || /^213[2-7]\d{8}$/.test(s)) {
    return null;
  }
  // Reject 15-digit NIF or 20-digit RIB
  if (/^\d{15}$/.test(s) || /^\d{20}$/.test(s)) {
    return null;
  }

  const val = parseFloat(s);
  if (!isNaN(val) && val > 0 && val < 50_000_000) return val;
  return null;
}

function parseAmount(text: string): number | null {
  // 1. Try explicit TTC / NET À PAYER patterns first
  for (const pattern of TTC_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m[1]) {
        // Discard if preceded by capital or tel
        const preContext = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
        if (/\b(capital|t[eé]l|phone|fax|nif|rc|rib)\b/.test(preContext)) continue;
        const val = normalizeAmountStr(m[1]);
        if (val !== null && val > 0) return val;
      }
    }
  }

  // 2. Try explicit HT patterns if TVA is explicitly zero
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

  // 3. Try general AMOUNT_PATTERNS with currency or Total keywords
  const candidates: number[] = [];
  for (const pattern of AMOUNT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[1] ?? match[0];
      const preContext = text.slice(Math.max(0, match.index - 35), match.index).toLowerCase();
      // Skip numbers belonging to metadata (phones, tax IDs, capital)
      if (/\b(capital|t[eé]l|phone|fax|nif|rc|rib|ccp|nis|article|code)\b/.test(preContext)) continue;
      const val = normalizeAmountStr(raw);
      if (val !== null) candidates.push(val);
    }
  }
  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  return null;
}

const SUPPLIER_PATTERNS: RegExp[] = [
  /(?:^|[\n\r]|\b)\s*(?:FOURNISSEUR|VENDEUR|EMETTEUR|ÉMETTEUR|FROM|DE LA PART DE)\s*[:\-–]\s*([^\n\r,]{3,80})/i,
  /(?:^|[\n\r])\s*(?:FOURNISSEUR|VENDEUR|EMETTEUR|ÉMETTEUR)\s*[:\-–]?\s*([^\n\r,]{3,80})/i,
  /(?:^|[\n\r]|\b)\s*(?:المورد|البائع|المصدر)\s*[:\-–]?\s*([^\n\r,]{3,80})/,
  /\b((?:SARL|SPA|EURL|EI|SNC|EPIC|SARL-U|SAS)\s+[A-ZÀ-Úa-zà-ú0-9\s\-&'.]{2,60})/,
  /\b((?:S\.A\.R\.L|S\.P\.A|E\.U\.R\.L|S\.A\.S)\s+[A-ZÀ-Úa-zà-ú0-9\s\-&'.]{2,60})/,
  /(?:RAISON\s*SOCIALE|SOCIÉTÉ|ENTREPRISE|ETABLISSEMENT|GROUPE)\s*[:\-–]?\s*([^\n\r,]{3,80})/i,
  /(?:الشركة|المؤسسة)\s*[:\-–]?\s*([^\n\r,]{3,80})/,
  /(?:A\s*L['']ORDRE\s*DE|لأمر)\s*[:\-–]?\s*([^\n\r,]{3,80})/i,
];

const CLIENT_PATTERNS: RegExp[] = [
  /(?:^|[\n\r]|\b)\s*(?:CLIENT|DESTINATAIRE|DOIT|FACTUR[EÉ]\s*[AÀ]|LIVR[EÉ]\s*[AÀ]|ACHETEUR)\s*[:\-–]\s*([^\n\r,]{3,80})/i,
  /(?:^|[\n\r])\s*(?:CLIENT|DESTINATAIRE|DOIT|ACHETEUR)\s*[:\-–]?\s*([^\n\r,]{3,80})/i,
  /(?:الزبون|المشتري|المرسل\s*إليه|إلى|السيد|السادة)\s*[:\-–]?\s*([^\n\r,]{3,80})/,
];

// Supplier / Client cleanup — remove addresses, phones, RC, NIF, table headers and OCR artifacts
function cleanSupplierCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    // Remove markdown image syntax e.g. "![img-0.jpeg](img-0.jpeg)" or "! img-0.jpeg (img-0.jpeg)"
    .replace(/!?\[.*?\](?:\(.*?\))?/gi, '')
    // Remove file extension artifacts with optional parens
    .replace(/!?\b[\w\-]+\.(?:jpe?g|png|gif|bmp|pdf|tiff?|webp|heic|svg)\b(?:\s*\([^)]*\))?/gi, '')
    .replace(/\([^)]*\.(?:jpe?g|png|gif|bmp|pdf|tiff?|webp|heic|svg)[^)]*\)/gi, '')
    // Stop at table headers / column titles
    .replace(/\s*(N[°º]\s*D[eé]signation|D[eé]signation|Quantit[eé]|Prix\s*Unit|Montant|Qt[eé]|Unit[eé]|P\.U\.|Réf\.?|Référence|Libellé|Description|Article|Code)(\s|$).*/i, '')
    // Stop at horizontal separators
    .replace(/\s*-{3,}.*/g, '')
    // Stop at cheque-specific phrases
    .replace(/\s*(Payable\s*[àa]|A\s*l['']ordre|payez|contre\s*ce\s*ch[eè]que|prière|zone\s*blanche).*/i, '')
    // Stop at address, contact info, tax IDs, or field labels
    .replace(/\s*(ADRESSE|ADR|TEL|TÉLÉPHONE|TELEPHONE|FAX|RC|NRC|NIF|NIS|AI|RIB|CCP|COMPTE|EMAIL|SITE|BP|AV\.|AVENUE|RUE|CITÉ|CITE|WILAYA|COMMUNE)\s*[:\-–].*/i, '')
    // Remove leading and trailing punctuation/symbols
    .replace(/^[^a-zA-ZÀ-ÿ\u0600-\u06FF0-9]+/, '')
    .replace(/[^a-zA-ZÀ-ÿ\u0600-\u06FF0-9]+$/, '')
    .substring(0, 70)
    .trim();
}

// Rejects supplier candidates that are clearly OCR noise or system artifacts
const SUPPLIER_NOISE_WORDS = /^(IMG|DESTINAT|DESTINATION|DESTINATAIRE|CLIENT|FOURNISSEUR|RECTO|VERSO|SCAN|PAGE|FILE|IMAGE|DOCUMENT|SPECIMEN|MODELE|BLANK|SAMPLE|TEST|DRAFT|COPY|ORIGINAL|UNDEFINED|NULL|NONE|UNKNOWN|FACTURE|INVOICE|CHEQUE|CHÈQUE)$/i;
const FILE_EXTENSION_RE = /\.(jpe?g|png|gif|bmp|pdf|tiff?|webp|heic|svg)/i;

function isValidSupplierCandidate(candidate: string): boolean {
  if (!candidate) return false;
  const stripped = candidate.replace(/^[^a-zA-ZÀ-ÿ\u0600-\u06FF0-9]+|[^a-zA-ZÀ-ÿ\u0600-\u06FF0-9]+$/g, '').trim();
  if (stripped.length < 3) return false;
  // Contains a file extension anywhere → filename leaked into OCR text
  if (FILE_EXTENSION_RE.test(candidate)) return false;
  // Is purely a known noise word
  if (SUPPLIER_NOISE_WORDS.test(stripped)) return false;
  // Is purely numeric
  if (/^\d+$/.test(stripped)) return false;
  // Has no letter at all
  if (!/[a-zA-ZÀ-ÿ\u0600-\u06FF]/.test(stripped)) return false;
  return true;
}

function parseSupplier(
  text: string,
  companyInput?: string | CompanyContext,
  docTypeHint?: DocumentType
): string | null {
  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);

  const isUserCompany = (c: string) => {
    if (!companyInput) return false;
    const targets: string[] = [];
    if (typeof companyInput === "string") {
      if (companyInput.trim().length >= 3) targets.push(companyInput);
    } else {
      if (companyInput.name && companyInput.name.trim().length >= 3) targets.push(companyInput.name);
      if (companyInput.raisonSociale && companyInput.raisonSociale.trim().length >= 3) targets.push(companyInput.raisonSociale);
      if (companyInput.nif && companyInput.nif.trim().length >= 5) targets.push(companyInput.nif);
      if (companyInput.nrc && companyInput.nrc.trim().length >= 5) targets.push(companyInput.nrc);
    }
    const candNorm = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    return targets.some((t) => {
      const tNorm = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      return candNorm.includes(tNorm) || tNorm.includes(candNorm);
    });
  };

  // If this is known to be a sales invoice (FACTURE_CLIENT), prioritize client/recipient patterns
  if (docTypeHint === "FACTURE_CLIENT") {
    for (const pattern of CLIENT_PATTERNS) {
      const m = text.match(pattern);
      if (m?.[1]) {
        const candidate = cleanSupplierCandidate(m[1]);
        if (isValidSupplierCandidate(candidate) && !isUserCompany(candidate)) return candidate;
      }
    }
  }

  // 1. Explicit supplier/emitter pattern (FOURNISSEUR, VENDEUR, EMETTEUR, A L'ORDRE DE)
  for (const pattern of [SUPPLIER_PATTERNS[0], SUPPLIER_PATTERNS[1], SUPPLIER_PATTERNS[2], SUPPLIER_PATTERNS[7]]) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const candidate = cleanSupplierCandidate(m[1]);
      if (isValidSupplierCandidate(candidate) && !isUserCompany(candidate)) return candidate;
    }
  }

  // 2. Look at header lines (0-12) for company forms (SARL, EURL, SPA, etc.)
  for (const line of lines.slice(0, 12)) {
    if (/\b(SARL|SPA|EURL|EI|SNC|EPIC|SARL-U|SAS)\b/i.test(line)) {
      const candidate = cleanSupplierCandidate(line);
      if (isValidSupplierCandidate(candidate) && !isUserCompany(candidate)) return candidate;
    }
  }

  // 3. Look at header lines (0-6) for individual names (e.g. "Célia Naudin")
  for (const line of lines.slice(0, 6)) {
    if (
      /^[A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+){1,3}$/.test(line) &&
      !/facture|invoice|total|date|montant|description|bon|livraison|devis|payez|cheque|chèque|banque|ordre|client/i.test(line)
    ) {
      const candidate = cleanSupplierCandidate(line);
      if (isValidSupplierCandidate(candidate) && !isUserCompany(candidate)) return candidate;
    }
  }

  // 4. Other patterns (RAISON SOCIALE, SOCIETE, ENTREPRISE...)
  for (const pattern of [SUPPLIER_PATTERNS[5], SUPPLIER_PATTERNS[6]]) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const candidate = cleanSupplierCandidate(m[1]);
      if (isValidSupplierCandidate(candidate) && !isUserCompany(candidate)) return candidate;
    }
  }

  // 5. Lines starting with DE / FROM / PAR
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^(DE|FROM|PAR|ÉMIS PAR|EMIS PAR|VENDEUR)\s*:?$/i.test(lines[i])) {
      const next = lines[i + 1];
      if (next && next.length >= 3 && !/^\d+$/.test(next)) {
        const cand = cleanSupplierCandidate(next);
        if (isValidSupplierCandidate(cand) && !isUserCompany(cand)) return cand;
      }
    }
  }

  // 6. Check CLIENT_PATTERNS if supplier patterns didn't match (e.g. sales invoice where emitter matched company)
  for (const pattern of CLIENT_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const candidate = cleanSupplierCandidate(m[1]);
      if (isValidSupplierCandidate(candidate) && !isUserCompany(candidate)) return candidate;
    }
  }

  // 7. Header uppercase company names (last resort — very permissive regex, needs strict validation)
  for (const line of lines.slice(0, 8)) {
    if (
      /^[A-ZÀ-Ü0-9\s\-&'.]{4,60}$/.test(line) &&
      !/^(FACTURE|INVOICE|DEVIS|BON|BON DE LIVRAISON|RELEV[EÉ]|TOTAL|MONTANT|DATE|R[EÉ]F[EÉ]RENCE|HEURE|N[°O]|QUINCAILLERIE|DROGUERIE|TEL|ADRESSE|DESIGNATION|QTE|PRIX|CHIFFRE|PAYEZ|CHEQUE|CHÈQUE|BANQUE|PAYABLE|IMG|SCAN|PAGE|DOCUMENT|IMAGE|FICHIER|DESTINAT|DESTINATION|DESTINATAIRE|CLIENT|FOURNISSEUR|SPECIMEN)$/i.test(line.trim()) &&
      // Must not look like a filename (contains a dot followed by an extension)
      !FILE_EXTENSION_RE.test(line)
    ) {
      const candidate = cleanSupplierCandidate(line);
      if (isValidSupplierCandidate(candidate) && !isUserCompany(candidate)) return candidate;
    }
  }

  return null;
}

const INVOICE_LABEL_PATTERNS: RegExp[] = [
  /(?:FACTURES?|FACT\.?)\s*(?:DE\s+VENTE|D['']ACHAT|CLIENT|FOURNISSEUR|PROFORMA|AVOIR)?\s*[N°NnOo°\.]{1,3}[\s°.:#]*([A-Z0-9][A-Z0-9\-\/\.]{0,29})/gi,
  /(?:FACTURES?|FACT\.?)\s*(?:DE\s+VENTE|D['']ACHAT|CLIENT|FOURNISSEUR|PROFORMA|AVOIR)?\s*[:#]\s*([A-Z0-9][A-Z0-9\-\/\.]{0,29})/gi,
  /\bN[\s°º\.]*[°oO0]?[\s]*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,29})/gi,
  /(?:NUM[EÉ]RO|NUM\.?|NUMÉRO)\s*(?:DE\s*FACTURE)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,29})/gi,
  /(?:INVOICE|INV\.?)\s*(?:NO\.?|N[°º]?|#|NUMBER)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,29})/gi,
  /(?:R[EÉ]F[EÉ]RENCE|R[EÉ]F\.?)\s*(?:FACTURE|DOC|DOCUMENT)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,29})/gi,
  /(?:رقم\s*الفاتورة|فاتورة\s*رقم|رقم\s*الوصل|رقم)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,29})/g,
  /(?:رقم\s*الفاتورة|فاتورة\s*رقم|رقم)\s*[:#]?\s*([\u0660-\u0669]{1,10})/g,
  /(?:B\.L\.?|BL|BON\s*DE\s*LIVRAISON|LIVRAISON)\s*[N°NnOo°\.]{0,3}[\s°.]*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{0,29})/gi,
  /#([A-Z0-9]{2,20})\b/gi,
];

const INVOICE_CODE_PATTERNS: RegExp[] = [
  /\b(FA[CT]{0,2}[-\/]\d{2,}(?:[-\/]\d+)*)\b/gi,
  /\b(INV[-\/]\d{2,}(?:[-\/]\d+)*)\b/gi,
  /\b(F\d{4,})\b/gi,
  /(?<![\/\d])((?:19|20)\d{2}\/[A-Z0-9\-]{2,10})(?![\/\d])/gi,
  /(?<![\/\d])([A-Z0-9\-]{2,10}\/(?:19|20)\d{2})(?![\/\d])/gi,
  /#([A-Z0-9]{2,20})\b/gi,
];

function cleanInvoiceCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^[^A-Z0-9٠-٩]/i, "")
    .replace(/[^A-Z0-9\-\/\.٠-٩]+$/i, "")
    .toUpperCase();
}

function isValidInvoiceNumber(candidate: string): boolean {
  if (!candidate || candidate.length < 1) return false;
  // Exclude full dates
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(candidate)) return false;
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(candidate)) return false;
  // Exclude MM/YYYY or DD/YYYY date fragments (e.g. 01/2026, 05/2024, 09/2026)
  if (/^\d{1,2}\/(?:19|20)\d{2}$/.test(candidate)) return false;
  if (/^(?:19|20)\d{2}\/\d{1,2}$/.test(candidate)) return false;
  if (/^\d+$/.test(candidate) && candidate.length > 10) return false;
  // Exclude words that are not invoice numbers
  if (/^(DATE|TOTAL|MONTANT|TTC|HT|TVA|PAGE|LE|DU|AU|SARL|EURL|SPA|CLIENT|FOURNISSEUR)$/i.test(candidate)) return false;
  // Must contain at least one digit or arabic numeral
  if (!/[0-9٠-٩]/.test(candidate)) return false;
  return true;
}

function parseInvoiceNumber(text: string, filename: string = ""): string | null {
  for (const pattern of INVOICE_LABEL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      const candidate = cleanInvoiceCandidate(raw);
      if (isValidInvoiceNumber(candidate)) {
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
        return candidate;
      }
    }
  }

  // Fallback to filename if text yielded no invoice number
  if (filename) {
    const cleanName = filename.replace(/\.[a-zA-Z0-9]+$/, "").trim();
    const fnMatch = cleanName.match(/(?:facture|fact|inv|invoice|bl|bon)[\s_\-]*(?:de\s+vente|d['']achat)?[\s_\-]*(?:n[°o\.]*)?[\s_\-]*([A-Z0-9][A-Z0-9\-\/]{0,20})$/i);
    if (fnMatch?.[1]) {
      const candidate = cleanInvoiceCandidate(fnMatch[1]);
      if (isValidInvoiceNumber(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

const CHEQUE_LABEL_PATTERNS: RegExp[] = [
  /CH[A-ZÈEÊa-zèeê\.6]{1,3}QUE\s*(?:N[°ºoO]?\.?|NUM[EÉ]RO|#|:)\s*[:#\s]*([A-Z0-9\-\/]{3,20})/gi,
  /[N°NnOo°\.]{1,3}\s*[°\s]*CH[A-ZÈEÊa-zèeê\.6]{1,3}QUE\s*[:#\s]*([A-Z0-9\-\/]{3,20})/gi,
  /NUM[EÉ]RO\s*(?:DE\s*)?CH[A-Za-z\.6]{1,3}QUE\s*[:#\s]*([A-Z0-9\-\/]{3,20})/gi,
  /CH[A-ZÈEÊa-zèeê\.6]{1,3}QUE\s+([0-9]{5,12})/gi,
  /ORDRE\s*(?:DE\s*)?PAIEMENT\s*N[°ºoO]?\.?\s*[:#\s]*([A-Z0-9\-\/]{3,20})/gi,
  /(?:شيك\s*رقم|رقم\s*الشيك)\s*[:#\s]*([A-Z0-9\-\/]{3,20})/gi,
  /(?:شيك\s*رقم|رقم\s*الشيك)\s*[:#\s]*([\u0660-\u0669]{4,12})/g,
];

// Algerian CMC7 / MICR line patterns and 7-digit cheque series
const CHEQUE_CMC7_PATTERNS: RegExp[] = [
  /[!|:;⑈](\d{7})[!|:;⑈]/,
  /\b(\d{7})\b(?:\s+\d{5}){2,}/,
  /\bN[°ºoO]?\.?\s*[:#]?\s*(\d{7})\b/i,
  /S[ée]rie\s*[A-Z0-9]*\s*N[°º]?\s*[:\s]*([0-9]{6,8})/i,
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
  if (!candidate || candidate.length < 3 || candidate.length > 20) return false;
  // Must contain at least one digit
  if (!/\d/.test(candidate)) return false;
  // Disallow pure dates
  if (/^\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4}$/.test(candidate)) return false;
  if (/^\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2}$/.test(candidate)) return false;
  // Disallow common words that might follow "Chèque" or "Virement"
  if (/^(BANCAIRE|POSTAL|VIREMENT|FOURNISSEUR|CLIENT|FACTURE|TTC|TOTAL|MONTANT|CHEQUE|CHÈQUE)$/i.test(candidate)) {
    return false;
  }
  return true;
}

export function parseChequeNumber(text: string): string | null {
  // 1. Check CMC7 / 7-digit Algerian cheque patterns first
  for (const pattern of CHEQUE_CMC7_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const candidate = cleanChequeCandidate(m[1]);
      if (isValidChequeNumber(candidate)) {
        console.log(`[parseChequeNumber] CMC7/7-digit match: "${m[0]}" → "${candidate}"`);
        return candidate;
      }
    }
  }

  // 2. Explicit label patterns
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

  // 3. CHQ codes
  const chqPattern = /\bCHQ[-\/]?([A-Z0-9]{2,20})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = chqPattern.exec(text)) !== null) {
    const candidate = cleanChequeCandidate(m[1]);
    if (isValidChequeNumber(candidate)) {
      console.log(`[parseChequeNumber] CHQ code match: "${m[0]}" → "${candidate}"`);
      return candidate;
    }
  }

  // 4. Digits near cheque keywords
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

export function parseChequeDate(text: string): string | null {
  const CHEQUE_DATE_CONTEXT_PATTERNS = [
    /(?:fait\s+[aà]\s+[A-Za-zÀ-ÿ\s\-]+,?\s*(?:le)?|le|en\s+date\s+du|date\s*:\s*|حرر\s+ب?[^\n,]+في|بتاريخ|في)\s*[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:fait\s+[aà]\s+[A-Za-zÀ-ÿ\s\-]+,?\s*(?:le)?|le)\s*[:\s]*(\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4})/i,
    /(?:حرر\s+في|بتاريخ|في)\s*[:\s]*(\d{1,2}\s+(?:يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\s+\d{4})/i,
  ];

  for (const pattern of CHEQUE_DATE_CONTEXT_PATTERNS) {
    const m = text.match(pattern);
    if (m && m[1]) {
      const parsed = parseDate(m[1]);
      if (parsed) return parsed;
    }
  }

  return parseDate(text);
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
    type: "FACTURE_CLIENT",
    keywords: ["facture client", "facture de vente", "sales invoice", "فاتورة بيع"],
  },
  {
    type: "FACTURE_FOURNISSEUR",
    keywords: [
      "facture fournisseur", "facture d'achat", "purchase invoice", "فاتورة شراء",
      "avoir fournisseur", "ticket de caisse", "reçu de paiement", "quittance", "note d'honoraire", "note",
      "facture", "invoice", "fact.", "f a c t u r e", "فاتورة"
    ],
  },
];

function detectDocumentType(
  text: string,
  filename: string,
  companyInput?: string | CompanyContext
): DocumentType {
  const haystack = `${text} ${filename}`.toLowerCase();
  let baseType: DocumentType = "AUTRE";
  for (const { type, keywords } of TYPE_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      baseType = type;
      break;
    }
  }

  // Refine using company context (who is the company: issuer or recipient?)
  const lines = text.split(/[\n\r]+/).map((l) => l.trim().toLowerCase());
  const targets: string[] = [];
  if (companyInput) {
    if (typeof companyInput === "string") {
      if (companyInput.trim().length >= 3) targets.push(companyInput.toLowerCase().replace(/[^a-z0-9]/g, ''));
    } else {
      if (companyInput.name && companyInput.name.trim().length >= 3) targets.push(companyInput.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (companyInput.raisonSociale && companyInput.raisonSociale.trim().length >= 3) targets.push(companyInput.raisonSociale.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (companyInput.nif && companyInput.nif.trim().length >= 5) targets.push(companyInput.nif.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (companyInput.nrc && companyInput.nrc.trim().length >= 5) targets.push(companyInput.nrc.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  }

  if (targets.length > 0 && (baseType === "FACTURE_FOURNISSEUR" || baseType === "FACTURE_CLIENT" || baseType === "AUTRE")) {
    const recipientMarkers = ["doit", "client", "destinataire", "acheteur", "facturé à", "facture a", "livré à", "livre a", "زبون", "المشتري", "المرسل إليه"];
    let isUserRecipient = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (recipientMarkers.some((m) => line.includes(m))) {
        const combined = (line + " " + (lines[i + 1] || "") + " " + (lines[i + 2] || "")).replace(/[^a-z0-9]/g, '');
        if (targets.some((t) => combined.includes(t))) {
          isUserRecipient = true;
          break;
        }
      }
    }

    let isUserEmitter = false;
    for (const line of lines.slice(0, 15)) {
      const norm = line.replace(/[^a-z0-9]/g, '');
      if (targets.some((t) => norm.includes(t))) {
        if (!recipientMarkers.some((m) => line.includes(m))) {
          isUserEmitter = true;
          break;
        }
      }
    }

    if (isUserRecipient) return "FACTURE_FOURNISSEUR";
    if (isUserEmitter) return "FACTURE_CLIENT";
    if (baseType === "FACTURE_CLIENT") return "FACTURE_CLIENT";
    if (baseType.includes("FACTURE")) return "FACTURE_FOURNISSEUR";
  }

  // If ambiguous or generic invoice, default to purchase invoice
  if (baseType === "FACTURE_CLIENT" && !haystack.includes("facture client") && !haystack.includes("facture de vente") && !haystack.includes("فاتورة بيع")) {
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
  companyInput?: string | CompanyContext
): ExtractedData {
  let documentType = detectDocumentType(rawText, filename, companyInput);
  const invoiceNumber = parseInvoiceNumber(rawText, filename);
  const chequeNumber = parseChequeNumber(rawText);

  if (chequeNumber && (documentType === "AUTRE" || documentType === "FACTURE_FOURNISSEUR")) {
    documentType = "CHEQUE";
  } else if (documentType === "AUTRE" && invoiceNumber) {
    documentType = "FACTURE_FOURNISSEUR";
  }

  const date = parseDate(rawText);
  const chequeDate = parseChequeDate(rawText) || date;
  const amount = parseAmount(rawText);
  const supplier = parseSupplier(rawText, companyInput, documentType);

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
  if (chequeDate) rawMatches.chequeDate = chequeDate;
  if (amount) rawMatches.amount = String(amount);
  if (amountHT) rawMatches.amountHT = String(amountHT);
  if (amountTVA) rawMatches.amountTVA = String(amountTVA);
  if (supplier) rawMatches.supplier = supplier;
  if (invoiceNumber) rawMatches.invoiceNumber = invoiceNumber;
  if (chequeNumber) rawMatches.chequeNumber = chequeNumber;

  const partial = {
    date, chequeDate, amount, amountHT, amountTVA,
    supplier, invoiceNumber, chequeNumber,
    documentType, rawMatches,
  };
  const confidence = scoreConfidence(partial);

  return { ...partial, confidence };
}
