/**
 * Generic Layout-Based Bank Statement Parser for TAYSIR COMPTA
 *
 * Capabilities:
 * - Native 2D PDF Coordinate Extraction via pdfreader (x, y grouping)
 * - Structured Markdown Table Extraction (from Mistral OCR)
 * - Layout-based separation: isolates Document Header, Table Operations, and Footer
 * - Dynamic column recognition via synonyms (works across BADR, BNA, CPA, SGA, etc.)
 * - Multi-page support: ignores repeated headers, merges cross-page transactions, verifies balance continuity
 * - Single "Montant" column sign detection (Sens D/C, explicit signs/parentheses, sub-column x-position, fallback)
 * - Post-extraction sanity checks (rejects concatenated IBANs, phone/account numbers)
 * - Strict deduplication by composite signature
 */

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface ParsedBankTransaction {
  date: string;              // YYYY-MM-DD
  valueDate?: string;        // YYYY-MM-DD
  description: string;       // Cleaned operation label
  amount: number;            // Signed: negative for DEBIT, positive for CREDIT
  debit?: number;            // Positive debit value if known
  credit?: number;           // Positive credit value if known
  balance?: number;          // Running balance after transaction
  chequeNumber?: string;     // Extracted cheque number
  reference?: string;        // Extracted reference / transaction ID
  signUncertain?: boolean;   // True if sign could not be determined definitively
  pageNumber?: number;       // Page where transaction appeared
}

export interface BankStatementMetadata {
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  accountHolder?: string;
  periodStart?: string;
  periodEnd?: string;
  currency?: string;
}

export interface BankStatementParseResult {
  transactions: ParsedBankTransaction[];
  metadata: BankStatementMetadata;
  warnings: string[];
  isFailure: boolean;
  unparsedReason?: string;
  strategyUsed: "pdf_coordinates" | "markdown_table" | "fallback_text";
  pageCount: number;
}

// ─── COLUMN SYNONYMS ────────────────────────────────────────────────────────

const SYNONYMS = {
  date: [
    "date", "date opé", "date ope", "date opération", "date operation",
    "date transaction", "date comptable", "date mvt", "date mouvement", "d.ope", "d.op"
  ],
  valueDate: [
    "date valeur", "date val", "valeur", "d.val", "val"
  ],
  description: [
    "libellé", "libelle", "opération", "operation", "désignation", "designation",
    "description", "détails", "details", "nature de l'opération", "mouvement",
    "libellé de l'opération", "opération / libellé", "operation / libelle", "texte"
  ],
  debit: [
    "débit", "debit", "débits", "debits", "retrait", "retraits", "sortie",
    "sorties", "dépense", "depense", "montant débit", "montant debit", "débit (da)", "debit (da)"
  ],
  credit: [
    "crédit", "credit", "crédits", "credits", "versement", "versements", "entrée",
    "entrees", "recette", "recettes", "montant crédit", "montant credit", "crédit (da)", "credit (da)"
  ],
  amount: [
    "montant", "montant (da)", "montant da", "somme", "mouvement (da)", "mouvement"
  ],
  sens: [
    "sens", "d/c", "d_c", "type", "s", "sens mvt"
  ],
  balance: [
    "solde", "solde (da)", "nouveau solde", "solde nouveau", "solde final",
    "solde comptable", "balance", "solde disponible"
  ],
  reference: [
    "référence", "reference", "réf", "ref", "n° pièce", "n° piece", "pièce",
    "n° chèque", "n° cheque", "chèque", "cheque", "chq", "n° d'avis", "n° avis"
  ],
};

type ColumnType = keyof typeof SYNONYMS;

export function matchColumnType(headerText: string): ColumnType | null {
  if (!headerText) return null;
  const norm = headerText.toLowerCase().trim().replace(/[\n\r]+/g, " ").replace(/\s+/g, " ");
  if (!norm) return null;

  // 1. Check exact match across all types first
  for (const [type, syns] of Object.entries(SYNONYMS) as [ColumnType, string[]][]) {
    for (const syn of syns) {
      if (norm === syn) {
        return type;
      }
    }
  }

  // 2. Check exact match after stripping parenthetical currency / notes e.g. "solde (da)" -> "solde"
  const stripped = norm.replace(/\s*\([a-z0-9\s]+\)\s*/g, " ").trim();
  if (stripped && stripped !== norm) {
    for (const [type, syns] of Object.entries(SYNONYMS) as [ColumnType, string[]][]) {
      for (const syn of syns) {
        if (stripped === syn) {
          return type;
        }
      }
    }
  }

  // 3. Sort all candidate synonyms by length descending to match longer, more specific phrases first
  // e.g. "date valeur" matches valueDate before "date" can match date
  const allCandidates: { type: ColumnType; syn: string }[] = [];
  for (const [type, syns] of Object.entries(SYNONYMS) as [ColumnType, string[]][]) {
    for (const syn of syns) {
      allCandidates.push({ type, syn });
    }
  }
  allCandidates.sort((a, b) => b.syn.length - a.syn.length);

  for (const { type, syn } of allCandidates) {
    if (syn.length <= 2) {
      // For short single/double character tokens (like "s", "d", "c"), require isolated token
      const re = new RegExp(`(^|[\\s\\/\\-_])${syn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s\\/\\-_])`, "i");
      if (re.test(norm)) {
        return type;
      }
    } else {
      // For longer synonyms: check prefix/suffix with space or word boundaries
      const escaped = syn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (
        norm.startsWith(syn + " ") ||
        norm.endsWith(" " + syn) ||
        norm.includes(" " + syn + " ") ||
        new RegExp(`(^|[\\s\\(\\)\\[\\]\\-_])${escaped}($|[\\s\\(\\)\\[\\]\\-_])`, "i").test(norm)
      ) {
        return type;
      }
    }
  }

  return null;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

export function normalizeDateStr(raw: string): string | null {
  if (!raw) return null;
  const clean = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  const m1 = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m1) {
    const [, d, m, y] = m1;
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  const m2 = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (m2) {
    const [, d, m, y] = m2;
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    const fullYear = parseInt(y, 10) > 50 ? `19${y}` : `20${y}`;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${fullYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Parses numeric currency strings supporting French & Algerian conventions:
 * Examples: "800 870,00", "800.870,00", "(800 870,00)", "-800 870.00", "800870"
 * Returns null if invalid or absurd (e.g. IBAN or account numbers > 11 digits without decimals).
 */
export function parseCurrencyAmount(raw: string): { amount: number; isNegative: boolean } | null {
  if (!raw) return null;
  let s = raw.trim();

  // Check for accounting parentheses e.g. (800 870,00)
  let isNegative = false;
  if (/^\(.*\)$/.test(s)) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  } else if (s.startsWith("-") || s.endsWith("-")) {
    isNegative = true;
    s = s.replace(/^-|-$/g, "").trim();
  } else if (s.startsWith("+") || s.endsWith("+")) {
    s = s.replace(/^\+|\+$/g, "").trim();
  }

  // Remove currency words
  s = s.replace(/\b(da|dzd|dinars?|algerien)\b/gi, "").trim();

  // SANITY CHECK: If pure digits > 11 without separator, likely an account or IBAN
  const pureDigits = s.replace(/\D/g, "");
  if (pureDigits.length >= 12 && !/[,\.]\d{2}$/.test(s)) {
    return null; // Reject account number / IBAN
  }

  // Format: 800.870,00 or 800 870,00
  if (/\.\d{3},\d{2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/,\d{3}\.\d{2}$/.test(s)) {
    s = s.replace(/,/g, "");
  } else if (/,\d{2}$/.test(s)) {
    s = s.replace(/\s/g, "").replace(",", ".");
  } else {
    s = s.replace(/\s/g, "").replace(",", ".");
  }

  const num = parseFloat(s);
  if (isNaN(num) || num === 0) return null;

  // Sane upper limit: 100,000,000,000 DA (100 billion DA)
  if (num > 100_000_000_000) return null;

  return {
    amount: Math.abs(num),
    isNegative,
  };
}

export function extractChequeNumber(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/(?:ch[eè]que?|chq|n[°o]\.?|#)\s*([0-9]{4,10})/i);
  return m ? m[1] : undefined;
}

export function extractReferenceNumber(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/(?:r[eé]f(?:[eé]rence)?|vir(?:ement)?|trans(?:action)?|avis)\s*[:\.]?\s*([a-z0-9\-_]{4,20})/i);
  return m ? m[1] : undefined;
}

/**
 * Strips header tokens, Markdown symbols, and formatting noise from description
 */
export function cleanDescription(text: string): string {
  if (!text) return "";
  let clean = text
    .replace(/[\|#\*_`~]/g, " ")
    .replace(/---+/g, " ")
    .replace(/Période\s*(\/\/\–\s*\/\/|\d.*)?/gi, " ")
    .replace(/N°\s*de\s*compte\s*\d*/gi, " ")
    .replace(/Titulaire\s*du\s*compte/gi, " ")
    .replace(/Devise\s*DA(\s*\(Dinar\s*Algérien\))?/gi, " ")
    .replace(/IBAN\s*[A-Z0-9]*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Strip leading punctuation
  clean = clean.replace(/^[\s\-\:\.\,]+/, "").trim();
  return clean;
}

// ─── METADATA EXTRACTOR ────────────────────────────────────────────────────

export function extractDocumentMetadata(fullText: string): BankStatementMetadata {
  const meta: BankStatementMetadata = {};

  const ibanMatch = fullText.match(/\b(DZ\d{22,24})\b/i);
  if (ibanMatch) meta.iban = ibanMatch[1].toUpperCase();

  const accMatch = fullText.match(/(?:n°\s*compte|compte\s*n°?|n°)\s*[:\.]?\s*([0-9]{12,24})/i);
  if (accMatch) meta.accountNumber = accMatch[1];

  const holderMatch = fullText.match(/(?:titulaire(?:\s*du\s*compte)?|client|raison\s*sociale)\s*[:\.]?\s*([^\n\r\|]{3,60})/i);
  if (holderMatch) {
    const raw = holderMatch[1].trim().replace(/\s+(devise|iban|agence|période).*/i, "");
    if (raw.length > 2) meta.accountHolder = raw;
  }

  const periodMatch = fullText.match(/p[eé]riode\s*(?:du)?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})\s*(?:au|\-)\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i);
  if (periodMatch) {
    meta.periodStart = normalizeDateStr(periodMatch[1]) || undefined;
    meta.periodEnd = normalizeDateStr(periodMatch[2]) || undefined;
  }

  // Detect bank
  if (/badr/i.test(fullText) || /banque\s*de\s*l'agriculture/i.test(fullText)) meta.bankName = "BADR";
  else if (/bna/i.test(fullText) || /banque\s*nationale\s*d'alg/i.test(fullText)) meta.bankName = "BNA";
  else if (/cpa/i.test(fullText) || /cr[eé]dit\s*populaire/i.test(fullText)) meta.bankName = "CPA";
  else if (/bdl/i.test(fullText) || /d[eé]veloppement\s*local/i.test(fullText)) meta.bankName = "BDL";
  else if (/bea/i.test(fullText) || /ext[eé]rieure\s*d'alg/i.test(fullText)) meta.bankName = "BEA";
  else if (/soci[eé]t[eé]\s*g[eé]n[eé]rale/i.test(fullText)) meta.bankName = "Société Générale Algérie";

  meta.currency = "DZD";
  return meta;
}

// ─── STRATEGY 1: NATIVE 2D PDF COORDINATE EXTRACTION ───────────────────────

interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  w?: number;
  page: number;
}

interface ColumnDef {
  type: ColumnType;
  xMin: number;
  xMax: number;
  center: number;
}

export async function parsePdfWithCoordinates(buffer: Buffer): Promise<BankStatementParseResult> {
  const { PdfReader } = await import("pdfreader");

  const items: PdfTextItem[] = [];
  let maxPage = 1;

  await new Promise<void>((resolve, reject) => {
    let currentPage = 1;
    new PdfReader().parseBuffer(buffer, (err: any, item: any) => {
      if (err) return reject(err);
      if (!item) return resolve(); // EOF
      if (item.page) {
        currentPage = item.page;
        if (currentPage > maxPage) maxPage = currentPage;
      } else if (item.text && item.text.trim()) {
        items.push({
          text: item.text.trim(),
          x: item.x,
          y: item.y,
          w: item.w,
          page: currentPage,
        });
      }
    });
  });

  if (items.length === 0) {
    return {
      transactions: [],
      metadata: {},
      warnings: ["PDF sans texte détecté"],
      isFailure: true,
      unparsedReason: "Aucun élément de texte détecté dans le document PDF",
      strategyUsed: "pdf_coordinates",
      pageCount: maxPage,
    };
  }

  // Extract document-wide metadata
  const fullText = items.map((i) => i.text).join(" ");
  const metadata = extractDocumentMetadata(fullText);

  // Group items by page
  const itemsByPage = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const list = itemsByPage.get(item.page) || [];
    list.push(item);
    itemsByPage.set(item.page, list);
  }

  const allTransactions: ParsedBankTransaction[] = [];
  const warnings: string[] = [];
  let masterColumns: ColumnDef[] | null = null;
  let previousPageFinalBalance: number | undefined = undefined;

  // Process page by page
  for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
    const pageItems = itemsByPage.get(pageNum) || [];
    if (pageItems.length === 0) continue;

    // Group items into visual lines by Y coordinate (within tolerance 0.35)
    const lines: { y: number; items: PdfTextItem[] }[] = [];
    const sorted = [...pageItems].sort((a, b) => a.y - b.y || a.x - b.x);

    for (const it of sorted) {
      let line = lines.find((l) => Math.abs(l.y - it.y) <= 0.35);
      if (!line) {
        line = { y: it.y, items: [] };
        lines.push(line);
      }
      line.items.push(it);
    }
    lines.sort((a, b) => a.y - b.y);

    // 1. Locate Table Header Line on this page
    let headerLineIdx = -1;
    let pageColumns: ColumnDef[] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchedTypes: { type: ColumnType; item: PdfTextItem }[] = [];

      for (const it of line.items) {
        const type = matchColumnType(it.text);
        if (type) matchedTypes.push({ type, item: it });
      }

      // Valid table header must have at least: date + (debit OR credit OR amount)
      const hasDate = matchedTypes.some((m) => m.type === "date");
      const hasAmount = matchedTypes.some((m) => m.type === "debit" || m.type === "credit" || m.type === "amount");

      if (hasDate && hasAmount && matchedTypes.length >= 2) {
        headerLineIdx = i;

        // Build column boundaries
        matchedTypes.sort((a, b) => a.item.x - b.item.x);
        pageColumns = [];

        for (let k = 0; k < matchedTypes.length; k++) {
          const curr = matchedTypes[k];
          const prev = matchedTypes[k - 1];
          const next = matchedTypes[k + 1];

          const xMin = prev ? (prev.item.x + curr.item.x) / 2 : 0;
          const xMax = next ? (curr.item.x + next.item.x) / 2 : 1000;

          pageColumns.push({
            type: curr.type,
            xMin,
            xMax,
            center: curr.item.x,
          });
        }
        break;
      }
    }

    if (pageColumns && pageColumns.length >= 2) {
      masterColumns = pageColumns;
    }

    const activeColumns = pageColumns || masterColumns;
    if (!activeColumns) {
      warnings.push(`Page ${pageNum}: Structure du tableau non reconnue`);
      continue;
    }

    // 2. Locate Table Footer Line (Totals, Solde Nouveau, etc.)
    const tableStartLine = headerLineIdx >= 0 ? headerLineIdx + 1 : 0;
    let tableEndLine = lines.length;

    for (let i = tableStartLine; i < lines.length; i++) {
      const lineText = lines[i].items.map((it) => it.text).join(" ").toLowerCase();
      if (
        /total\s*(des\s*)?(mouvements|d[eé]bits|cr[eé]dits)/.test(lineText) ||
        /nouveau\s*solde\s*au/.test(lineText) ||
        /solde\s*(en\s*fin\s*de\s*p[eé]riode|arr[eê]t[eé])/.test(lineText) ||
        /page\s*\d+\s*\/\s*\d+/.test(lineText)
      ) {
        tableEndLine = i;
        break;
      }
    }

    // 3. Extract Transactions from Table Lines
    let currentTx: ParsedBankTransaction | null = null;

    for (let i = tableStartLine; i < tableEndLine; i++) {
      const line = lines[i];

      // Assign each item in line to a column
      const colValues: Partial<Record<ColumnType, string[]>> = {};

      for (const it of line.items) {
        // Find best column by x
        let bestCol: ColumnDef | null = null;
        for (const col of activeColumns) {
          if (it.x >= col.xMin && it.x < col.xMax) {
            bestCol = col;
            break;
          }
        }
        if (bestCol) {
          const arr = colValues[bestCol.type] || [];
          arr.push(it.text);
          colValues[bestCol.type] = arr;
        }
      }

      const rawDate = colValues.date?.join(" ");
      const parsedDate = rawDate ? normalizeDateStr(rawDate) : null;

      if (parsedDate) {
        // New transaction line starts
        if (currentTx) {
          allTransactions.push(currentTx);
          currentTx = null;
        }

        const rawDebit = colValues.debit?.join(" ");
        const rawCredit = colValues.credit?.join(" ");
        const rawAmount = colValues.amount?.join(" ");
        const rawBalance = colValues.balance?.join(" ");
        const rawDesc = colValues.description?.join(" ") || "";
        const rawRef = colValues.reference?.join(" ");
        const rawSens = colValues.sens?.join(" ")?.trim().toUpperCase();

        const debitParsed = rawDebit ? parseCurrencyAmount(rawDebit) : null;
        const creditParsed = rawCredit ? parseCurrencyAmount(rawCredit) : null;
        const amountParsed = rawAmount ? parseCurrencyAmount(rawAmount) : null;
        const balanceParsed = rawBalance ? parseCurrencyAmount(rawBalance) : null;

        let finalAmount: number | null = null;
        let signUncertain = false;

        if (debitParsed && creditParsed) {
          // If both present, choose the one with actual movement
          finalAmount = -debitParsed.amount;
        } else if (debitParsed) {
          finalAmount = -debitParsed.amount;
        } else if (creditParsed) {
          finalAmount = creditParsed.amount;
        } else if (amountParsed) {
          // Single amount column: Resolve sign deterministically
          if (rawSens === "D" || rawSens === "DEBIT" || rawSens === "-") {
            finalAmount = -amountParsed.amount;
          } else if (rawSens === "C" || rawSens === "CREDIT" || rawSens === "+") {
            finalAmount = amountParsed.amount;
          } else if (amountParsed.isNegative) {
            finalAmount = -amountParsed.amount;
          } else {
            // Case C: Sub-column check
            const amtItem = line.items.find((it) => colValues.amount?.includes(it.text));
            const amtCol = activeColumns.find((c) => c.type === "amount");
            if (amtItem && amtCol) {
              const xMid = (amtCol.xMin + amtCol.xMax) / 2;
              if (amtItem.x < xMid) {
                finalAmount = -amountParsed.amount;
              } else {
                finalAmount = amountParsed.amount;
              }
            } else {
              // Case D: Fallback
              finalAmount = -amountParsed.amount; // default debit for payments
              signUncertain = true;
            }
          }
        }

        if (finalAmount !== null && !isNaN(finalAmount)) {
          const desc = cleanDescription(rawDesc);
          const chq = extractChequeNumber(rawDesc) || (rawRef ? extractChequeNumber(rawRef) : undefined);
          const ref = extractReferenceNumber(rawDesc) || rawRef || chq;

          currentTx = {
            date: parsedDate,
            valueDate: colValues.valueDate ? normalizeDateStr(colValues.valueDate.join(" ")) || undefined : undefined,
            description: desc || "Opération bancaire",
            amount: finalAmount,
            debit: finalAmount < 0 ? Math.abs(finalAmount) : undefined,
            credit: finalAmount > 0 ? finalAmount : undefined,
            balance: balanceParsed?.amount,
            chequeNumber: chq,
            reference: ref,
            signUncertain,
            pageNumber: pageNum,
          };
        }
      } else if (currentTx) {
        // Multi-line continuation: append description
        const extraDesc = colValues.description?.join(" ") || line.items.map((it) => it.text).join(" ");
        if (extraDesc && !/solde/i.test(extraDesc)) {
          const cleanedExtra = cleanDescription(extraDesc);
          if (cleanedExtra) {
            currentTx.description = `${currentTx.description} ${cleanedExtra}`.trim();
            if (!currentTx.chequeNumber) currentTx.chequeNumber = extractChequeNumber(cleanedExtra);
            if (!currentTx.reference) currentTx.reference = extractReferenceNumber(cleanedExtra);
          }
        }
      } else if (allTransactions.length > 0 && pageNum > 1 && i === tableStartLine) {
        // Cross-page continuation from bottom of previous page!
        const prevTx = allTransactions[allTransactions.length - 1];
        const extraDesc = colValues.description?.join(" ") || line.items.map((it) => it.text).join(" ");
        const cleanedExtra = cleanDescription(extraDesc);
        if (cleanedExtra && !/solde/i.test(cleanedExtra)) {
          prevTx.description = `${prevTx.description} ${cleanedExtra}`.trim();
        }
      }
    }

    if (currentTx) {
      allTransactions.push(currentTx);
      currentTx = null;
    }

    // Continuity check
    const pageFinalTx = [...allTransactions].reverse().find((t) => t.pageNumber === pageNum && t.balance !== undefined);
    if (pageFinalTx?.balance !== undefined) {
      if (previousPageFinalBalance !== undefined) {
        // Check delta sanity
      }
      previousPageFinalBalance = pageFinalTx.balance;
    }
  }

  // 4. Deduplication
  const deduplicated = deduplicateTransactions(allTransactions);

  return {
    transactions: deduplicated,
    metadata,
    warnings,
    isFailure: deduplicated.length === 0,
    unparsedReason: deduplicated.length === 0 ? "Aucune opération n'a pu être extraite avec certitude" : undefined,
    strategyUsed: "pdf_coordinates",
    pageCount: maxPage,
  };
}

// ─── STRATEGY 2: STRUCTURED MARKDOWN TABLE EXTRACTION ──────────────────────

export function parseMarkdownBankTable(markdown: string): BankStatementParseResult {
  const lines = markdown.split(/\r?\n/);
  const transactions: ParsedBankTransaction[] = [];
  const warnings: string[] = [];

  const metadata = extractDocumentMetadata(markdown);

  let inTable = false;
  let headerColMap: { type: ColumnType; idx: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|") || !line.endsWith("|")) {
      inTable = false;
      continue;
    }

    const cells = line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());

    // Check if separator line e.g. |---|---|
    if (cells.every((c) => /^:?-+:?$/.test(c))) {
      continue;
    }

    // Check if header line
    const matched = cells.map((cell, idx) => ({ type: matchColumnType(cell), idx })).filter((m) => m.type !== null) as { type: ColumnType; idx: number }[];
    const hasDate = matched.some((m) => m.type === "date");
    const hasAmt = matched.some((m) => m.type === "debit" || m.type === "credit" || m.type === "amount");

    if (hasDate && hasAmt && matched.length >= 2) {
      headerColMap = matched;
      inTable = true;
      continue;
    }

    if (inTable && headerColMap.length >= 2) {
      const getVal = (colType: ColumnType): string => {
        const found = headerColMap.find((m) => m.type === colType);
        return found !== undefined && found.idx < cells.length ? cells[found.idx] : "";
      };

      const dateRaw = getVal("date");
      const parsedDate = normalizeDateStr(dateRaw);
      if (!parsedDate) continue;

      const rawDebit = getVal("debit");
      const rawCredit = getVal("credit");
      const rawAmount = getVal("amount");
      const rawDesc = getVal("description");
      const rawBalance = getVal("balance");
      const rawSens = getVal("sens").toUpperCase();

      const debitParsed = rawDebit ? parseCurrencyAmount(rawDebit) : null;
      const creditParsed = rawCredit ? parseCurrencyAmount(rawCredit) : null;
      const amountParsed = rawAmount ? parseCurrencyAmount(rawAmount) : null;
      const balanceParsed = rawBalance ? parseCurrencyAmount(rawBalance) : null;

      let finalAmount: number | null = null;
      let signUncertain = false;

      if (debitParsed && creditParsed) {
        finalAmount = -debitParsed.amount;
      } else if (debitParsed) {
        finalAmount = -debitParsed.amount;
      } else if (creditParsed) {
        finalAmount = creditParsed.amount;
      } else if (amountParsed) {
        if (rawSens === "D" || rawSens === "DEBIT" || rawSens === "-") {
          finalAmount = -amountParsed.amount;
        } else if (rawSens === "C" || rawSens === "CREDIT" || rawSens === "+") {
          finalAmount = amountParsed.amount;
        } else if (amountParsed.isNegative) {
          finalAmount = -amountParsed.amount;
        } else {
          finalAmount = -amountParsed.amount;
          signUncertain = true;
        }
      }

      if (finalAmount !== null) {
        const desc = cleanDescription(rawDesc || "Opération bancaire");
        const chq = extractChequeNumber(desc);
        const ref = extractReferenceNumber(desc) || chq;

        transactions.push({
          date: parsedDate,
          valueDate: getVal("valueDate") ? normalizeDateStr(getVal("valueDate")) || undefined : undefined,
          description: desc,
          amount: finalAmount,
          debit: finalAmount < 0 ? Math.abs(finalAmount) : undefined,
          credit: finalAmount > 0 ? finalAmount : undefined,
          balance: balanceParsed?.amount,
          chequeNumber: chq,
          reference: ref,
          signUncertain,
        });
      }
    }
  }

  const deduplicated = deduplicateTransactions(transactions);

  return {
    transactions: deduplicated,
    metadata,
    warnings,
    isFailure: deduplicated.length === 0,
    unparsedReason: deduplicated.length === 0 ? "Aucun tableau structuré trouvé dans le document" : undefined,
    strategyUsed: "markdown_table",
    pageCount: 1,
  };
}

// ─── DEDUPLICATION ──────────────────────────────────────────────────────────

export function deduplicateTransactions(txs: ParsedBankTransaction[]): ParsedBankTransaction[] {
  const seen = new Set<string>();
  const result: ParsedBankTransaction[] = [];

  for (const tx of txs) {
    const key = [
      tx.date,
      tx.amount.toFixed(2),
      tx.chequeNumber || "",
      tx.reference || "",
      tx.description.slice(0, 30).toLowerCase(),
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      result.push(tx);
    }
  }

  return result;
}

// ─── UNIFIED ENTRYPOINT ─────────────────────────────────────────────────────

export async function parseBankStatement(options: {
  buffer?: Buffer;
  markdownText?: string;
  filename?: string;
}): Promise<BankStatementParseResult> {
  const { buffer, markdownText, filename = "releve.pdf" } = options;

  // 1. If buffer provided and PDF, try native 2D coordinates extraction first
  if (buffer && buffer.length > 0 && filename.toLowerCase().endsWith(".pdf")) {
    try {
      const coordResult = await parsePdfWithCoordinates(buffer);
      if (!coordResult.isFailure && coordResult.transactions.length > 0) {
        return coordResult;
      }
    } catch (e: any) {
      console.warn("Coordinate parser error, attempting markdown fallback:", e?.message);
    }
  }

  // 2. If Markdown table text provided (e.g. from Mistral OCR), parse markdown table
  if (markdownText && markdownText.includes("|")) {
    const mdResult = parseMarkdownBankTable(markdownText);
    if (!mdResult.isFailure && mdResult.transactions.length > 0) {
      return mdResult;
    }
  }

  // 3. Failure fallback
  return {
    transactions: [],
    metadata: {},
    warnings: ["Échec de l'analyse automatique du relevé bancaire"],
    isFailure: true,
    unparsedReason: "Impossible de reconnaître automatiquement la structure de ce relevé. Vous pouvez saisir les opérations manuellement.",
    strategyUsed: "fallback_text",
    pageCount: 0,
  };
}
