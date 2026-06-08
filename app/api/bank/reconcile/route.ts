/**
 * POST /api/bank/reconcile
 * Enhanced reconciliation with:
 *   - cheque number matching (highest priority)
 *   - amount ±1% tolerance
 *   - date ±3 days tolerance
 *   - matchScore: "exact" | "cheque" | "partial" | "none"
 *   - chequeNumber extracted from CSV 4th column or from description
 *   - PDF support via OCR → bank statement line parsing
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { runOcr } from "@/lib/ocr/professional-ocr";

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCsv(
  text: string
): { date: string; description: string; amount: number; chequeNumber?: string }[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  const dataLines = lines[0].toLowerCase().includes("date") ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      if (parts.length < 3) return null;
      const [rawDate, description, amountStr, rawCheque] = parts;

      const date = normalizeDate(rawDate.trim());
      if (!date) return null;

      const normalized = amountStr
        .trim()
        .replace(/\s/g, "")
        .replace(/\.(\d{3})/g, "$1")
        .replace(",", ".");

      const amount = parseFloat(normalized);
      if (isNaN(amount)) return null;

      // Try explicit 4th column first, then extract from description
      const chequeNumber =
        rawCheque?.trim() || extractChequeFromText(description) || undefined;

      return { date, description: description.trim(), amount, chequeNumber };
    })
    .filter(Boolean) as { date: string; description: string; amount: number; chequeNumber?: string }[];
}

// ─── PDF raw-text parser ──────────────────────────────────────────────────────
// Tries to extract bank statement lines from OCR raw text.
// Matches lines containing a date + amount pattern.
function parsePdfBankText(
  rawText: string
): { date: string; description: string; amount: number; chequeNumber?: string }[] {
  const results: { date: string; description: string; amount: number; chequeNumber?: string }[] = [];

  // Patterns for amounts in Algerian bank statements (e.g. "1 234 567,89" or "1234567.89")
  const AMOUNT_RE = /(\d[\d\s]*[\d](?:[.,]\d{2})?)/g;
  // Date patterns: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const DATE_RE = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})/;

  const lines = rawText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 5);

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    const date = normalizeDate(dateMatch[1]);
    if (!date) continue;

    // Find all numbers in the line
    const numbers: number[] = [];
    let m: RegExpExecArray | null;
    const re = /(\d[\d\s]*\d(?:[.,]\d{2})?)/g;
    while ((m = re.exec(line)) !== null) {
      const n = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
      if (!isNaN(n) && n > 0) numbers.push(n);
    }

    if (numbers.length === 0) continue;

    // Take the largest number as the transaction amount
    const amount = Math.max(...numbers);
    if (amount < 1) continue;

    // Extract description: text between date and first number
    const afterDate = line.slice(dateMatch.index! + dateMatch[1].length).trim();
    const description = afterDate.replace(/\d[\d\s]*[\d](?:[.,]\d{2})?/g, "").replace(/\s+/g, " ").trim() || line.trim();

    const chequeNumber = extractChequeFromText(line) || undefined;

    results.push({ date, description: description.slice(0, 120), amount, chequeNumber });
  }

  return results;
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return raw;
  return null;
}

function extractChequeFromText(text: string): string | null {
  // Matches patterns: "Chèque N°12345", "CHQ 12345", "Chq12345", "#12345"
  const match = text.match(/(?:ch[eè]que?|chq|n[°o]\.?|#)\s*(\d{4,})/i);
  return match ? match[1] : null;
}

// ─── Matching helpers ─────────────────────────────────────────────────────────
function datesMatch(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= 3 * 24 * 60 * 60 * 1000;
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1) <= 0.01;
}

type MatchScore = "exact" | "cheque" | "partial" | "none";

interface UnmatchedEntry {
  id: string;
  date: Date;
  amount: number;
  description: string;
  reference: string | null;
}

function findBestMatch(
  row: { date: string; amount: number; chequeNumber?: string },
  unmatched: UnmatchedEntry[]
): { entry: UnmatchedEntry | null; score: MatchScore } {
  const rowDate = new Date(row.date);
  const absAmount = Math.abs(row.amount);

  // Priority 1: cheque number match (exact regardless of date/amount tolerance)
  if (row.chequeNumber) {
    const chequeMatch = unmatched.find(
      (e) =>
        e.reference &&
        e.reference.replace(/\D/g, "").includes(row.chequeNumber!.replace(/\D/g, "")) &&
        amountsMatch(e.amount, absAmount)
    );
    if (chequeMatch) return { entry: chequeMatch, score: "cheque" };
  }

  // Priority 2: amount + date (exact)
  const exactMatch = unmatched.find(
    (e) => amountsMatch(e.amount, absAmount) && datesMatch(new Date(e.date), rowDate)
  );
  if (exactMatch) return { entry: exactMatch, score: "exact" };

  // Priority 3: amount only (partial — different date)
  const partialMatch = unmatched.find((e) => amountsMatch(e.amount, absAmount));
  if (partialMatch) return { entry: partialMatch, score: "partial" };

  return { entry: null, score: "none" };
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !["CLIENT", "COMPTABLE"].includes(user.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;

  if (!file || !companyId) {
    return Response.json({ error: "Fichier (CSV ou PDF) et companyId requis" }, { status: 400 });
  }

  const company = await db.company.findFirst({
    where: { 
      id: companyId,
      ...(user.role === "CLIENT" ? { clientId: user.userId } : { comptableId: user.userId })
    },
  });
  if (!company) {
    return Response.json({ error: "Entreprise introuvable" }, { status: 403 });
  }

  // ── Detect file type and parse rows ────────────────────────────────────────
  const mimeType = file.type || "";
  const fileName = file.name || "";
  const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isCsv = mimeType === "text/csv" || fileName.toLowerCase().endsWith(".csv");

  let rows: { date: string; description: string; amount: number; chequeNumber?: string }[] = [];

  if (isCsv) {
    const csvText = await file.text();
    rows = parseCsv(csvText);
    if (rows.length === 0) {
      return Response.json(
        { error: "Aucune transaction valide dans le CSV. Format: date,description,montant" },
        { status: 400 }
      );
    }
  } else if (isPdf) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ocrResult = await runOcr(buffer, fileName, mimeType);
      rows = parsePdfBankText(ocrResult.rawText);
      if (rows.length === 0) {
        return Response.json(
          { error: "Aucune transaction détectée dans le PDF. Vérifiez que le relevé est lisible." },
          { status: 400 }
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur OCR";
      return Response.json({ error: `Échec de l'analyse du PDF: ${msg}` }, { status: 500 });
    }
  } else {
    return Response.json(
      { error: "Format non supporté. Utilisez un fichier CSV ou PDF." },
      { status: 400 }
    );
  }


  const journalEntries = await db.journalEntry.findMany({
    where: { status: "VALIDATED", document: { companyId } },
    select: {
      id: true,
      date: true,
      amount: true,
      description: true,
      reference: true,
      bankTransaction: { select: { id: true } },
    },
  });

  // Only use entries not yet matched
  const unmatchedEntries: UnmatchedEntry[] = journalEntries
    .filter((e) => !e.bankTransaction)
    .map((e) => ({
      id: e.id,
      date: e.date,
      amount: e.amount,
      description: e.description,
      reference: e.reference,
    }));

  const used = new Set<string>(); // prevent double-matching

  const resultsData = rows.map((row) => {
    const available = unmatchedEntries.filter((e) => !used.has(e.id));
    const { entry: matched, score } = findBestMatch(row, available);
    if (matched) used.add(matched.id);
    return { row, matched, score };
  });

  // Insert bank transactions and get IDs
  const createdTransactions = await db.$transaction(
    resultsData.map(({ row, matched }) =>
      db.bankTransaction.create({
        data: {
          date: new Date(row.date),
          description: row.description,
          amount: row.amount,
          chequeNumber: row.chequeNumber ?? null,
          matched: !!matched,
          companyId,
          journalEntryId: matched?.id ?? undefined,
        },
      })
    )
  );

  const results = resultsData.map(({ row, matched, score }, index) => ({
    id: createdTransactions[index].id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    chequeNumber: row.chequeNumber ?? null,
    matchScore: score,
    matched: score !== "none",
    matchedEntry: matched
      ? { description: matched.description, amount: matched.amount, reference: matched.reference }
      : undefined,
  }));

  const matchedCount = results.filter((r) => r.matched).length;
  const totalEcart = results
    .filter((r) => !r.matched)
    .reduce((s, r) => s + Math.abs(r.amount), 0);

  return Response.json({
    total: results.length,
    matched: matchedCount,
    unmatched: results.length - matchedCount,
    totalEcart,
    results,
  });
}
