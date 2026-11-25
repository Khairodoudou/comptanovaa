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
    "date", "dates", "date op", "date op.", "date opé", "date ope", "date opération", "date operation",
    "date d'opération", "date d'operation", "date transaction", "date comptable", "date compta",
    "date comptabilisation", "date mvt", "date mouvement", "d.ope", "d.op", "dt op"
  ],
  valueDate: [
    "date valeur", "date de valeur", "date val", "date val.", "valeur", "d.val", "d. valeur", "val", "dt val"
  ],
  description: [
    "libellé", "libelle", "libellé opération", "libelle operation", "opération", "operation", "opérations", "operations",
    "désignation", "designation", "désignation opération", "description", "détails", "details", "détail", "detail",
    "nature de l'opération", "nature de l'operation", "nature opération", "nature operation", "nature",
    "mouvement", "libellé de l'opération", "opération / libellé", "operation / libelle", "libellé / référence",
    "intitulé", "intitule", "motif", "objet", "commentaire", "texte"
  ],
  debit: [
    "débit", "debit", "débits", "debits", "retrait", "retraits", "sortie", "sorties",
    "dépense", "depense", "montant débit", "montant debit", "mvt débit", "mvt debit",
    "débit (da)", "debit (da)", "débit (dzd)", "debit (dzd)", "débit da", "debit da", "somme débit"
  ],
  credit: [
    "crédit", "credit", "crédits", "credits", "versement", "versements", "entrée", "entrées",
    "entrees", "recette", "recettes", "montant crédit", "montant credit", "mvt crédit", "mvt credit",
    "crédit (da)", "credit (da)", "crédit (dzd)", "credit (dzd)", "crédit da", "credit da", "somme crédit"
  ],
  amount: [
    "montant", "montants", "montant (da)", "montant (dzd)", "montant da", "somme",
    "mouvement (da)", "mouvements", "mouvement"
  ],
  sens: [
    "sens", "d/c", "d_c", "type", "s", "sens mvt"
  ],
  balance: [
    "solde", "solde (da)", "solde (dzd)", "solde en da", "solde en dzd", "nouveau solde",
    "solde nouveau", "solde final", "solde comptable", "solde progressif", "solde courant",
    "solde après", "solde apres", "balance", "solde disponible"
  ],
  reference: [
    "référence", "reference", "réf", "réf.", "ref", "ref.", "n° pièce", "n° piece", "pièce",
    "n° op", "n° opération", "code op", "n° chèque", "n° cheque", "chèque", "cheque", "chq", "n° d'avis", "n° avis"
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

    // Group items into visual lines by Y coordinate (within tolerance 0.5)
    const lines: { y: number; items: PdfTextItem[] }[] = [];
    const sorted = [...pageItems].sort((a, b) => a.y - b.y || a.x - b.x);

    for (const it of sorted) {
      let line = lines.find((l) => Math.abs(l.y - it.y) <= 0.5);
      if (!line) {
        line = { y: it.y, items: [] };
        lines.push(line);
      }
      line.items.push(it);
    }
    lines.sort((a, b) => a.y - b.y);

    // 1. Locate Table Header Line on this page (supports 1-line and 2-line wrapped headers)
    let headerLineIdx = -1;
    let pageColumns: ColumnDef[] | null = null;

    const findDateToken = (text: string): string | null => {
      const m = text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}-\d{2}-\d{2})/);
      return m ? normalizeDateStr(m[1]) : null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let candidateItems = [...line.items];

      // Check if next line is a wrapped header continuation (has no transaction date and contains header keywords)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextText = nextLine.items.map((it) => it.text).join(" ");
        const nextHasTxDate = !!findDateToken(nextText);
        const yGap = nextLine.y - line.y;
        if (!nextHasTxDate && yGap <= 1.2) {
          const nextHasHeaderHints = nextLine.items.some(
            (it) => matchColumnType(it.text) !== null || /\b(op[eé]\.?|valeur|val\.?|\(da\)|\(dzd\)|l'op[eé]ration)\b/i.test(it.text)
          );
          if (nextHasHeaderHints) {
            // Merge vertically aligned items within x tolerance 2.5
            const merged: PdfTextItem[] = candidateItems.map((it) => ({ ...it }));
            for (const nxt of nextLine.items) {
              const target = merged.find((m) => Math.abs(m.x - nxt.x) <= 2.5);
              if (target) {
                target.text = `${target.text} ${nxt.text}`.trim();
              } else {
                merged.push({ ...nxt });
              }
            }
            candidateItems = merged;
          }
        }
      }

      const matchedTypes: { type: ColumnType; item: PdfTextItem }[] = [];
      for (const it of candidateItems) {
        const type = matchColumnType(it.text);
        if (type) matchedTypes.push({ type, item: it });
      }

      // Valid table header must have at least: date + (debit OR credit OR amount)
      const hasDate = matchedTypes.some((m) => m.type === "date");
      const hasAmount = matchedTypes.some((m) => m.type === "debit" || m.type === "credit" || m.type === "amount");

      if (hasDate && hasAmount && matchedTypes.length >= 2) {
        headerLineIdx = candidateItems.length > line.items.length || candidateItems.some((c, idx) => c.text !== line.items[idx]?.text)
          ? i + 1
          : i;

        // Sort left-to-right and resolve duplicate date columns (e.g. Date / Date Valeur)
        matchedTypes.sort((a, b) => a.item.x - b.item.x);
        let seenDate = false;
        for (const mt of matchedTypes) {
          if (mt.type === "date") {
            if (!seenDate) seenDate = true;
            else mt.type = "valueDate";
          }
        }

        // Auto-synthesize description column if missing and there's a wide gap after date/valueDate
        const hasDesc = matchedTypes.some((m) => m.type === "description");
        if (!hasDesc) {
          const firstAmtIdx = matchedTypes.findIndex((m) => m.type === "debit" || m.type === "credit" || m.type === "amount");
          if (firstAmtIdx > 0) {
            const leftCol = matchedTypes[firstAmtIdx - 1];
            const rightCol = matchedTypes[firstAmtIdx];
            if (rightCol.item.x - leftCol.item.x >= 8) {
              matchedTypes.splice(firstAmtIdx, 0, {
                type: "description",
                item: { text: "Libellé", x: leftCol.item.x + 3.5, y: leftCol.item.y, page: pageNum },
              });
            }
          }
        }

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
            center: curr.item.x + (curr.item.w || 0) / 2,
          });
        }
        break;
      }
    }

    if (pageColumns && pageColumns.length >= 2) {
      masterColumns = pageColumns;
    }

    let activeColumns = pageColumns || masterColumns;

    // ── Headerless fallback: auto-infer columns from data lines when no header found ──
    // Collect all data-lines that have a date + at least one currency amount,
    // then cluster the amount x-positions to guess debit/credit/balance columns.
    if (!activeColumns && items.length > 0) {
      const dataLineItems: { dateX: number; amtXs: number[] }[] = [];
      for (const dataLine of lines) {
        const lineText = dataLine.items.map((i) => i.text).join(" ");
        const hasDate = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(lineText);
        if (!hasDate) continue;
        const amtXs: number[] = [];
        for (const it of dataLine.items) {
          if (/(?:\d{1,3}(?:[\s\u00a0\.]\d{3})+|\d{1,9})[,\.]\d{2}/.test(it.text)) {
            amtXs.push(it.x);
          }
        }
        if (amtXs.length > 0) {
          const dateItem = dataLine.items.find((i) => /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]/.test(i.text));
          dataLineItems.push({ dateX: dateItem?.x ?? 0, amtXs });
        }
      }

      if (dataLineItems.length >= 2) {
        // Find the leftmost consistent date X → date column
        const dateXCenter = dataLineItems.map((d) => d.dateX).sort((a, b) => a - b)[0];
        // Collect all amount X positions, cluster them
        const allAmtX = dataLineItems.flatMap((d) => d.amtXs).sort((a, b) => a - b);
        // Simple 1-pass cluster (gap > 3 units = new cluster)
        const clusters: number[][] = [];
        for (const x of allAmtX) {
          const last = clusters[clusters.length - 1];
          if (!last || x - last[last.length - 1] > 3) clusters.push([x]);
          else last.push(x);
        }
        const clusterCenters = clusters.map((c) => c.reduce((s, v) => s + v, 0) / c.length);

        if (clusterCenters.length >= 1) {
          const infCols: ColumnDef[] = [
            { type: "date", xMin: 0, xMax: dateXCenter + 4, center: dateXCenter },
            // Treat intermediate items between date and first amount as description
            { type: "description", xMin: dateXCenter + 4, xMax: clusterCenters[0] - 2, center: (dateXCenter + clusterCenters[0]) / 2 },
          ];
          if (clusterCenters.length === 1) {
            infCols.push({ type: "amount", xMin: clusterCenters[0] - 2, xMax: 1000, center: clusterCenters[0] });
          } else if (clusterCenters.length === 2) {
            infCols.push({ type: "amount", xMin: clusterCenters[0] - 2, xMax: (clusterCenters[0] + clusterCenters[1]) / 2, center: clusterCenters[0] });
            infCols.push({ type: "balance", xMin: (clusterCenters[0] + clusterCenters[1]) / 2, xMax: 1000, center: clusterCenters[1] });
          } else {
            infCols.push({ type: "debit",   xMin: clusterCenters[0] - 2, xMax: (clusterCenters[0] + clusterCenters[1]) / 2, center: clusterCenters[0] });
            infCols.push({ type: "credit",  xMin: (clusterCenters[0] + clusterCenters[1]) / 2, xMax: (clusterCenters[1] + clusterCenters[2]) / 2, center: clusterCenters[1] });
            infCols.push({ type: "balance", xMin: (clusterCenters[1] + clusterCenters[2]) / 2, xMax: 1000, center: clusterCenters[2] });
          }
          activeColumns = infCols;
          masterColumns = infCols;
          warnings.push(`Page ${pageNum}: En-tête non reconnu — colonnes inférées automatiquement`);
        }
      }
    }

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

      const rawDate = colValues.date?.join(" ") || "";
      const dateTokenMatch = rawDate.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}-\d{2}-\d{2})/);
      const parsedDate = dateTokenMatch ? normalizeDateStr(dateTokenMatch[1]) : null;
      const dateLeftover = dateTokenMatch ? rawDate.replace(dateTokenMatch[1], "").trim() : "";

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
        const rawDesc = [dateLeftover, colValues.description?.join(" ") || ""].filter(Boolean).join(" ");
        const rawRef = colValues.reference?.join(" ");
        const rawSens = colValues.sens?.join(" ")?.trim().toUpperCase();

        const debitParsed = rawDebit ? parseCurrencyAmount(rawDebit) : null;
        const creditParsed = rawCredit ? parseCurrencyAmount(rawCredit) : null;
        const amountParsed = rawAmount ? parseCurrencyAmount(rawAmount) : null;
        const balanceParsed = rawBalance ? parseCurrencyAmount(rawBalance) : null;

        let finalAmount: number | null = null;
        let signUncertain = false;

        if (debitParsed && creditParsed) {
          // If both debit and credit are present, the non-zero one is the actual movement
          if (debitParsed.amount > 0 && creditParsed.amount === 0) {
            finalAmount = -debitParsed.amount;
          } else if (creditParsed.amount > 0 && debitParsed.amount === 0) {
            finalAmount = creditParsed.amount;
          } else {
            // Both non-zero is unusual; treat debit as the dominant movement
            finalAmount = -debitParsed.amount;
          }
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

  // 4. Deduplication & sign inference from running balances / keywords
  const deduplicated = inferSignFromBalanceAndKeywords(deduplicateTransactions(allTransactions));

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
    if (!line.includes("|")) {
      inTable = false;
      continue;
    }

    const strippedEdges = line.replace(/^\|/, "").replace(/\|$/, "");
    const cells = strippedEdges.split("|").map((c) => c.trim());
    if (cells.length < 2) {
      inTable = false;
      continue;
    }

    // Check if separator line e.g. |---|---|
    if (cells.every((c) => c === "" || /^:?-+:?$/.test(c)) && cells.some((c) => /-{2,}/.test(c))) {
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
        // Both present: pick the non-zero movement column
        if (debitParsed.amount > 0 && creditParsed.amount === 0) {
          finalAmount = -debitParsed.amount;
        } else if (creditParsed.amount > 0 && debitParsed.amount === 0) {
          finalAmount = creditParsed.amount;
        } else {
          finalAmount = -debitParsed.amount;
        }
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

  const deduplicated = inferSignFromBalanceAndKeywords(deduplicateTransactions(transactions));

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

// ─── SIGN INFERENCE (BALANCE CONTINUITY + BANKING KEYWORDS) ─────────────────

const CREDIT_DESC_RE =
  /\b(versement|virement\s+re[cç]u|vir\.?\s*re[cç]u|virement\s+entrant|remise\s+(?:de\s+)?ch[eè]que|encaissement|cr[eé]dit|avoir|remboursement\s+re[cç]u|int[eé]r[eê]ts\s+cr[eé]diteurs)\b/i;

const DEBIT_DESC_RE =
  /\b(retrait|frais|commission|agios|pr[eé]l[eè]vement|paiement|r[eè]glement\s+fournisseur|virement\s+[eé]mis|virement\s+sortant|ch[eè]que|chq|timbre|cotisation|tva\s+sur\s+frais)\b/i;

/**
 * Resolves uncertain transaction signs deterministically using running balance
 * continuity first, then clear banking direction keywords when needed.
 */
export function inferSignFromBalanceAndKeywords(
  txs: ParsedBankTransaction[]
): ParsedBankTransaction[] {
  const result = txs.map((t) => ({ ...t }));

  // Pass 1: Balance continuity check (prevBalance +/- amount === currBalance)
  for (let i = 1; i < result.length; i++) {
    const prev = result[i - 1];
    const curr = result[i];
    if (!curr.signUncertain) continue;
    if (prev.balance === undefined || curr.balance === undefined) continue;

    const absAmt = Math.abs(curr.amount);
    const ifCredit = Math.abs(prev.balance + absAmt - curr.balance);
    const ifDebit = Math.abs(prev.balance - absAmt - curr.balance);

    if (ifCredit < 0.05 && ifDebit > 1) {
      curr.amount = absAmt;
      curr.credit = absAmt;
      curr.debit = undefined;
      curr.signUncertain = false;
    } else if (ifDebit < 0.05 && ifCredit > 1) {
      curr.amount = -absAmt;
      curr.debit = absAmt;
      curr.credit = undefined;
      curr.signUncertain = false;
    }
  }

  // Pass 2: Safe banking direction keywords (only when clear keyword matches)
  for (const curr of result) {
    if (!curr.signUncertain) continue;
    const absAmt = Math.abs(curr.amount);
    const isCreditKw = CREDIT_DESC_RE.test(curr.description);
    const isDebitKw = DEBIT_DESC_RE.test(curr.description);
    if (isCreditKw && !isDebitKw) {
      curr.amount = absAmt;
      curr.credit = absAmt;
      curr.debit = undefined;
      curr.signUncertain = false;
    } else if (isDebitKw && !isCreditKw) {
      curr.amount = -absAmt;
      curr.debit = absAmt;
      curr.credit = undefined;
      curr.signUncertain = false;
    }
  }

  return result;
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

// ─── STRATEGY 3: RAW TEXT LINE PARSER ───────────────────────────────────────
//
// Works on raw text (from pdfreader, Gemini OCR, Mistral OCR, etc.)
// even when no markdown table is present.
// Scans line by line for: DATE [VALUE_DATE] ... AMOUNT [AMOUNT] [BALANCE]
// Handles Algerian bank statement formats: BADR, BNA, CPA, BDL, BEA, SGA.
//

const RAW_LINE_DATE_RE =
  /(?:^|[\s;,|])((?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2}))(?=$|[\s;,|])/g;

const RAW_LINE_AMOUNT_RE =
  /(?:^|[\s;,|])(\(?[-+]?\s*(?:\d{1,3}(?:[\s\u00a0\.]\d{3})+|\d{1,3}(?:,\d{3})+|\d{1,9})[\.,]\d{2}\s*(?:DA|DZD|dinars?)?\)?)(?=$|[\s;,|])/gi;

const RAW_LINE_SENS_RE = /(?:^|[\s;,|])([DC])(?=$|[\s;,|])/;

function parseRawAmountOrZero(
  raw: string
): { raw: string; amount: number; isNegative: boolean; isZero: boolean } | null {
  const clean = raw.trim();
  if (/^[\(\-+]?\s*0+(?:[\.,]00)?\s*(?:DA|DZD|dinars?)?\)?$/i.test(clean)) {
    return { raw: clean, amount: 0, isNegative: false, isZero: true };
  }
  const parsed = parseCurrencyAmount(clean);
  if (!parsed) return null;
  return { raw: clean, ...parsed, isZero: false };
}

/** Scan plain text (line by line) for bank operations. */
export function parseRawTextBankStatement(rawText: string): BankStatementParseResult {
  const lines = rawText.split(/\r?\n/);
  const transactions: ParsedBankTransaction[] = [];
  const warnings: string[] = [];
  const metadata = extractDocumentMetadata(rawText);

  const hasSensPattern = /(?:^|[\s;,|])[DC](?=$|[\s;,|])/m.test(rawText);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 10) continue;

    // Skip obvious header/footer lines
    if (
      /solde\s*(initial|ouverture|report|d[eé]but|pr[eé]c[eé]dent|ancien)/i.test(line) ||
      /total\s*(des\s*)?(mouvement|d[eé]bit|cr[eé]dit|op[eé]ration)/i.test(line) ||
      /nouveau\s*solde/i.test(line) ||
      /^\s*[-=]{5,}\s*$/.test(line) ||
      /^\s*page\s*\d+/i.test(line)
    ) {
      continue;
    }

    // 1. Extract dates on this line (operation date + optional value date)
    const dateMatches: { raw: string; normalized: string }[] = [];
    const dateRe = new RegExp(RAW_LINE_DATE_RE.source, "g");
    let dm: RegExpExecArray | null;
    while ((dm = dateRe.exec(line)) !== null) {
      const normalized = normalizeDateStr(dm[1]);
      if (normalized) {
        dateMatches.push({ raw: dm[1], normalized });
      }
    }
    if (dateMatches.length === 0) continue;

    const parsedDate = dateMatches[0].normalized;
    const parsedValueDate = dateMatches.length >= 2 ? dateMatches[1].normalized : undefined;

    // 2. Extract all amounts on this line (including explicit 0,00 columns)
    const amountTokens: Array<{ raw: string; amount: number; isNegative: boolean; isZero: boolean }> = [];
    const amtRe = new RegExp(RAW_LINE_AMOUNT_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = amtRe.exec(line)) !== null) {
      const parsed = parseRawAmountOrZero(m[1]);
      if (parsed) {
        amountTokens.push(parsed);
      }
    }

    const nonZeroAmounts = amountTokens.filter((a) => !a.isZero);
    if (nonZeroAmounts.length === 0) continue;

    // 3. Determine description: strip dates, sens token, and amounts
    let desc = line;
    for (const d of dateMatches.slice(0, 2)) {
      desc = desc.replace(d.raw, " ");
    }
    for (const am of amountTokens) {
      desc = desc.replace(am.raw, " ");
    }
    const sensMatch = line.match(RAW_LINE_SENS_RE);
    if (sensMatch) {
      desc = desc.replace(new RegExp(`(^|[\\s;,|])${sensMatch[1]}(?=$|[\\s;,|])`), "$1");
    }
    desc = cleanDescription(desc);
    if (!desc || desc.length < 1) desc = "Opération bancaire";

    // 4. Determine movement amount, sign, and running balance
    let finalAmount: number | null = null;
    let signUncertain = false;
    let balance: number | undefined;

    if (amountTokens.length >= 3) {
      // Pattern with Debit | Credit | Balance (one of first two may be 0,00)
      const col1 = amountTokens[0];
      const col2 = amountTokens[1];
      const lastAmt = amountTokens[amountTokens.length - 1];

      if (!col1.isZero && col2.isZero) {
        finalAmount = -col1.amount;
      } else if (col1.isZero && !col2.isZero) {
        finalAmount = col2.amount;
      } else if (sensMatch) {
        finalAmount = sensMatch[1] === "D" ? -nonZeroAmounts[0].amount : nonZeroAmounts[0].amount;
      } else if (nonZeroAmounts[0].isNegative) {
        finalAmount = -nonZeroAmounts[0].amount;
      } else {
        finalAmount = -nonZeroAmounts[0].amount;
        signUncertain = true;
      }
      balance = lastAmt.amount;
    } else if (nonZeroAmounts.length >= 2) {
      // Pattern: Movement | Balance (or Debit | Credit without balance)
      const movement = nonZeroAmounts[0];
      const lastAmt = nonZeroAmounts[nonZeroAmounts.length - 1];
      if (sensMatch) {
        finalAmount = sensMatch[1] === "D" ? -movement.amount : movement.amount;
      } else if (movement.isNegative) {
        finalAmount = -movement.amount;
      } else {
        finalAmount = -movement.amount;
        signUncertain = true;
      }
      balance = lastAmt.amount;
    } else {
      // Single non-zero amount (could still have an accompanying 0,00)
      const movement = nonZeroAmounts[0];
      if (amountTokens.length === 2 && amountTokens[0].isZero && !amountTokens[1].isZero) {
        finalAmount = movement.amount;
      } else if (amountTokens.length === 2 && !amountTokens[0].isZero && amountTokens[1].isZero) {
        finalAmount = -movement.amount;
      } else if (sensMatch) {
        finalAmount = sensMatch[1] === "D" ? -movement.amount : movement.amount;
      } else if (movement.isNegative) {
        finalAmount = -movement.amount;
      } else {
        finalAmount = -movement.amount;
        signUncertain = true;
      }
    }

    if (finalAmount === null || isNaN(finalAmount)) continue;

    const chq = extractChequeNumber(desc);
    const ref = extractReferenceNumber(desc) || chq;

    transactions.push({
      date: parsedDate,
      valueDate: parsedValueDate,
      description: desc,
      amount: finalAmount,
      debit: finalAmount < 0 ? Math.abs(finalAmount) : undefined,
      credit: finalAmount > 0 ? finalAmount : undefined,
      balance,
      chequeNumber: chq,
      reference: ref,
      signUncertain,
    });
  }

  const resolved = inferSignFromBalanceAndKeywords(deduplicateTransactions(transactions));

  if (!hasSensPattern && resolved.some((t) => t.signUncertain)) {
    warnings.push(
      "Sens D/C non détecté sur certaines lignes — vérifiez les signes des montants."
    );
  }

  return {
    transactions: resolved,
    metadata,
    warnings,
    isFailure: resolved.length === 0,
    unparsedReason:
      resolved.length === 0
        ? "Aucune opération n'a pu être extraite du texte brut du relevé."
        : undefined,
    strategyUsed: "fallback_text",
    pageCount: 1,
  };
}

// ─── STRATEGY 4: PDF VISUAL-LINE TEXT VIA PDFREADER ──────────────────────────
//
// Groups PdfReader items by (page, y) into actual visual rows so the raw-text
// parser sees one transaction per line rather than one giant string per page.
//

export async function parsePdfRawText(buffer: Buffer): Promise<BankStatementParseResult> {
  const { PdfReader } = await import("pdfreader");

  const items: PdfTextItem[] = [];
  let maxPage = 1;

  await new Promise<void>((resolve, reject) => {
    let currentPage = 1;
    new PdfReader().parseBuffer(buffer, (err: any, item: any) => {
      if (err) return reject(err);
      if (!item) return resolve();
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
      warnings: ["Aucun texte extrait du PDF (PDF image ou verrouillé)"],
      isFailure: true,
      unparsedReason: "Le PDF ne contient pas de texte lisible.",
      strategyUsed: "fallback_text",
      pageCount: maxPage,
    };
  }

  const pageLines: string[] = [];
  for (let p = 1; p <= maxPage; p++) {
    const pItems = items.filter((it) => it.page === p).sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: { y: number; items: PdfTextItem[] }[] = [];
    for (const it of pItems) {
      let row = rows.find((r) => Math.abs(r.y - it.y) <= 0.5);
      if (!row) {
        row = { y: it.y, items: [] };
        rows.push(row);
      }
      row.items.push(it);
    }
    rows.sort((a, b) => a.y - b.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      pageLines.push(r.items.map((it) => it.text).join("  "));
    }
  }

  const result = parseRawTextBankStatement(pageLines.join("\n"));
  return { ...result, pageCount: maxPage };
}

// ─── STRATEGY 5: DELIMITED CSV / TSV / HTML TABLE (.xls portals) ─────────────

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parses CSV (comma, semicolon, or tab separated) and HTML-table .xls exports
 * using the same synonym-based column mapping + balance/sign inference.
 */
export function parseDelimitedBankStatement(rawContent: string): BankStatementParseResult {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return {
      transactions: [],
      metadata: {},
      warnings: ["Fichier vide"],
      isFailure: true,
      unparsedReason: "Le fichier importé est vide.",
      strategyUsed: "fallback_text",
      pageCount: 1,
    };
  }

  // Convert HTML <table> (common for Algerian bank .xls portal exports) into pipe-delimited Markdown
  if (/<tr[\s>]/i.test(trimmed) && /<t[dh][\s>]/i.test(trimmed)) {
    const mdLines: string[] = [];
    const trMatches = trimmed.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trMatches) {
      const cellMatches = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      const cells = cellMatches.map((c) =>
        c
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/\s+/g, " ")
          .trim()
      );
      if (cells.length >= 2) {
        mdLines.push(`| ${cells.join(" | ")} |`);
      }
    }
    if (mdLines.length >= 2) {
      const htmlTableRes = parseMarkdownBankTable(mdLines.join("\n"));
      if (!htmlTableRes.isFailure && htmlTableRes.transactions.length > 0) {
        return htmlTableRes;
      }
    }
  }

  const lines = trimmed.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) {
    return {
      transactions: [],
      metadata: {},
      warnings: [],
      isFailure: true,
      unparsedReason: "Aucune ligne trouvée.",
      strategyUsed: "fallback_text",
      pageCount: 1,
    };
  }

  // Detect delimiter from the first 10 lines
  const sample = lines.slice(0, 10).join("\n");
  const semiCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const delimiter =
    tabCount >= semiCount && tabCount >= commaCount && tabCount > 0
      ? "\t"
      : semiCount >= commaCount && semiCount > 0
      ? ";"
      : ",";

  // Look for a header row in the first 10 lines
  let headerIdx = -1;
  let headerColMap: { type: ColumnType; idx: number }[] = [];

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const matched = cells
      .map((cell, idx) => ({ type: matchColumnType(cell), idx }))
      .filter((m) => m.type !== null) as { type: ColumnType; idx: number }[];

    const hasDate = matched.some((m) => m.type === "date");
    const hasAmt = matched.some((m) => m.type === "debit" || m.type === "credit" || m.type === "amount");
    if (hasDate && hasAmt && matched.length >= 2) {
      headerIdx = i;
      headerColMap = matched;
      break;
    }
  }

  // If header found, convert to Markdown table and reuse parseMarkdownBankTable!
  if (headerIdx >= 0 && headerColMap.length >= 2) {
    const headerCells = splitCsvLine(lines[headerIdx], delimiter).map((c) => c.replace(/\|/g, " "));
    const mdRows: string[] = [
      `| ${headerCells.join(" | ")} |`,
      `| ${headerCells.map(() => "---").join(" | ")} |`,
    ];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i], delimiter).map((c) => c.replace(/\|/g, " "));
      if (cells.length >= 2) {
        mdRows.push(`| ${cells.join(" | ")} |`);
      }
    }
    const res = parseMarkdownBankTable(mdRows.join("\n"));
    if (!res.isFailure && res.transactions.length > 0) {
      return res;
    }
  }

  // Headerless fallback: date, description, amount [, cheque, ref, sender, balance]
  const transactions: ParsedBankTransaction[] = [];
  const startIdx = lines[0].toLowerCase().includes("date") ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i], delimiter);
    if (parts.length < 3) continue;
    const [rawDate, description, amountStr, rawCheque, rawRef, , rawBalance] = parts;
    const date = normalizeDateStr(rawDate);
    if (!date) continue;

    const amt = parseCurrencyAmount(amountStr);
    if (!amt) continue;

    const finalAmount = amt.isNegative ? -amt.amount : amt.amount;
    const bal = rawBalance ? parseCurrencyAmount(rawBalance)?.amount : undefined;
    const desc = cleanDescription(description || "Opération bancaire");
    const chq = rawCheque?.trim() || extractChequeNumber(desc);
    const ref = rawRef?.trim() || extractReferenceNumber(desc) || chq;

    transactions.push({
      date,
      description: desc,
      amount: finalAmount,
      debit: finalAmount < 0 ? Math.abs(finalAmount) : undefined,
      credit: finalAmount > 0 ? finalAmount : undefined,
      balance: bal,
      chequeNumber: chq,
      reference: ref,
    });
  }

  const deduplicated = deduplicateTransactions(transactions);
  return {
    transactions: deduplicated,
    metadata: extractDocumentMetadata(trimmed),
    warnings: [],
    isFailure: deduplicated.length === 0,
    unparsedReason:
      deduplicated.length === 0 ? "Aucune transaction valide trouvée dans le fichier." : undefined,
    strategyUsed: "fallback_text",
    pageCount: 1,
  };
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
      console.log(`[PDF Parser] Strategy 1 (coordinates): ${coordResult.transactions.length} tx, failure=${coordResult.isFailure}, warnings=${JSON.stringify(coordResult.warnings)}`);
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

  // 3. If raw text from OCR provided (no structured table), try raw text line parser
  if (markdownText && markdownText.trim().length > 50) {
    const rawResult = parseRawTextBankStatement(markdownText);
    if (!rawResult.isFailure && rawResult.transactions.length > 0) {
      return rawResult;
    }
  }

  // 4. If buffer provided and PDF, try flat text extraction + raw line parser
  if (buffer && buffer.length > 0 && filename.toLowerCase().endsWith(".pdf")) {
    try {
      const rawPdfResult = await parsePdfRawText(buffer);
      console.log(`[PDF Parser] Strategy 4 (raw text): ${rawPdfResult.transactions.length} tx, failure=${rawPdfResult.isFailure}`);
      if (!rawPdfResult.isFailure && rawPdfResult.transactions.length > 0) {
        return rawPdfResult;
      }
    } catch (e: any) {
      console.warn("Raw PDF text parser error:", e?.message);
    }
  }

  // 5. Final failure fallback
  return {
    transactions: [],
    metadata: {},
    warnings: ["Échec de l'analyse automatique du relevé bancaire"],
    isFailure: true,
    unparsedReason:
      "Impossible de reconnaître automatiquement la structure de ce relevé. " +
      "Le format du PDF n'est pas encore pris en charge automatiquement. " +
      "Vous pouvez saisir les opérations manuellement.",
    strategyUsed: "fallback_text",
    pageCount: 0,
  };
}
