/**
 * POST /api/bank/reconcile
 * Enhanced intelligent bank reconciliation engine with:
 *   - 100%: Perfect match (Reference/cheque + amount + date within 3 days)
 *   - 95%: Highly probable (Amount match + reference/cheque match OR exact amount + date)
 *   - 80%: Manual verification needed (Amount match OR close amount/date match)
 *   - 0%: No match found
 * Stores BankStatementImport session and creates ReconciliationMatch records.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { runOcr } from "@/lib/ocr/professional-ocr";

function parseCsv(
  text: string
): { date: string; description: string; amount: number; chequeNumber?: string; reference?: string; senderName?: string; balance?: number }[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  const dataLines = lines[0].toLowerCase().includes("date") ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      if (parts.length < 3) return null;
      const [rawDate, description, amountStr, rawCheque, rawRef, rawSender, rawBalance] = parts;

      const date = normalizeDate(rawDate.trim());
      if (!date) return null;

      const normalized = amountStr
        .trim()
        .replace(/\s/g, "")
        .replace(/\.(\d{3})/g, "$1")
        .replace(",", ".");

      const amount = parseFloat(normalized);
      if (isNaN(amount)) return null;

      const chequeNumber = rawCheque?.trim() || extractChequeFromText(description) || undefined;
      const reference = rawRef?.trim() || extractRefFromText(description) || undefined;
      const senderName = rawSender?.trim() || undefined;
      const balance = rawBalance ? parseFloat(rawBalance.replace(/\s/g, "").replace(",", ".")) : undefined;

      return { date, description: description.trim(), amount, chequeNumber, reference, senderName, balance: isNaN(balance as number) ? undefined : balance };
    })
    .filter(Boolean) as { date: string; description: string; amount: number; chequeNumber?: string; reference?: string; senderName?: string; balance?: number }[];
}

function parsePdfBankText(
  rawText: string
): { date: string; description: string; amount: number; chequeNumber?: string; reference?: string }[] {
  const results: { date: string; description: string; amount: number; chequeNumber?: string; reference?: string }[] = [];

  const DATE_RE = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})/;

  const lines = rawText.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 5);

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    const date = normalizeDate(dateMatch[1]);
    if (!date) continue;

    const afterDate = line.slice(dateMatch.index! + dateMatch[1].length).trim();

    const numbers: number[] = [];
    let m: RegExpExecArray | null;

    const decimalRe = /(\d[\d\s]*[.,]\d{2})/g;
    while ((m = decimalRe.exec(afterDate)) !== null) {
      const n = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
      if (!isNaN(n) && n > 0) numbers.push(n);
    }

    if (numbers.length === 0) {
      const anyRe = /(\d[\d\s]*)/g;
      while ((m = anyRe.exec(afterDate)) !== null) {
        const n = parseFloat(m[1].replace(/\s/g, ""));
        if (!isNaN(n) && n > 0) numbers.push(n);
      }
    }

    if (numbers.length === 0) continue;

    const amount = Math.max(...numbers);
    const description = afterDate.replace(/\d[\d\s]*[.,]?\d*/g, "").replace(/\s+/g, " ").trim() || line.trim();
    const chequeNumber = extractChequeFromText(line) || undefined;
    const reference = extractRefFromText(line) || undefined;

    results.push({ date, description: description.slice(0, 120), amount, chequeNumber, reference });
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
  const match = text.match(/(?:ch[eè]que?|chq|n[°o]\.?|#)\s*(\d{4,})/i);
  return match ? match[1] : null;
}

function extractRefFromText(text: string): string | null {
  const match = text.match(/(?:ref|virement|vir|ref:|n°)\s*([a-z0-9\-]{5,})/i);
  return match ? match[1] : null;
}

function datesMatch(a: Date, b: Date, maxDays = 3): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= maxDays * 24 * 60 * 60 * 1000;
}

function amountsMatch(a: number, b: number, tolerancePct = 0.01): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1) <= tolerancePct;
}

interface TargetItem {
  id: string;
  type: "declaration" | "entry" | "invoice";
  date: Date;
  amount: number;
  description: string;
  reference: string | null;
  clientName?: string;
  invoiceNumber?: string;
  declarationData?: any;
}

function calculateScore(
  row: { date: string; amount: number; chequeNumber?: string; reference?: string; description: string },
  target: TargetItem
): number {
  const rowDate = new Date(row.date);
  const absAmount = Math.abs(row.amount);
  const amountEqual = amountsMatch(target.amount, absAmount);
  const dateEqual = datesMatch(target.date, rowDate, 3);
  const dateClose = datesMatch(target.date, rowDate, 7);

  const refMatch =
    (row.chequeNumber && target.reference && target.reference.includes(row.chequeNumber)) ||
    (row.reference && target.reference && target.reference.toLowerCase() === row.reference.toLowerCase()) ||
    (target.invoiceNumber && row.description.toLowerCase().includes(target.invoiceNumber.toLowerCase()));

  const clientMatch = target.clientName && row.description.toLowerCase().includes(target.clientName.toLowerCase());

  if (amountEqual && refMatch && dateEqual) return 100;
  if (amountEqual && (refMatch || dateEqual)) return 95;
  if (amountEqual && (clientMatch || dateClose)) return 80;
  if (amountEqual) return 80;

  return 0;
}

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
      ...(user.role === "CLIENT" ? { clientId: user.userId } : { comptableId: user.userId }),
    },
    include: { client: true },
  });

  if (!company) {
    return Response.json({ error: "Entreprise introuvable" }, { status: 403 });
  }

  const mimeType = file.type || "";
  const fileName = file.name || "";
  const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isCsv = mimeType === "text/csv" || fileName.toLowerCase().endsWith(".csv");

  let rows: { date: string; description: string; amount: number; chequeNumber?: string; reference?: string; senderName?: string; balance?: number }[] = [];

  if (isCsv) {
    const csvText = await file.text();
    rows = parseCsv(csvText);
  } else if (isPdf) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ocrResult = await runOcr(buffer, fileName, mimeType);
      rows = parsePdfBankText(ocrResult.rawText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur OCR";
      return Response.json({ error: `Échec de l'analyse du PDF: ${msg}` }, { status: 500 });
    }
  } else {
    return Response.json({ error: "Format non supporté. Utilisez CSV ou PDF." }, { status: 400 });
  }

  if (rows.length === 0) {
    return Response.json({ error: "Aucune transaction valide trouvée dans le fichier." }, { status: 400 });
  }

  // Gather match targets:
  // 1. Pending payment declarations
  const pendingDeclarations = await db.paymentDeclaration.findMany({
    where: { invoice: { companyId }, status: "PENDING" },
    include: { invoice: { include: { company: { include: { client: true } } } } },
  });

  // 2. Unmatched validated journal entries on 512
  const journalEntries = await db.journalEntry.findMany({
    where: {
      status: "VALIDATED",
      OR: [
        { companyId },
        { document: { companyId } },
      ],
    },
    select: {
      id: true,
      date: true,
      amount: true,
      description: true,
      reference: true,
      bankTransaction: { select: { id: true } },
    },
  });

  const targets: TargetItem[] = [
    ...pendingDeclarations.map((d) => ({
      id: d.id,
      type: "declaration" as const,
      date: d.paymentDate || d.createdAt,
      amount: d.amount,
      description: `Déclaration client: Facture ${d.invoice.invoiceNumber || d.invoiceId}`,
      reference: d.reference,
      clientName: d.invoice.company.client.name,
      invoiceNumber: d.invoice.invoiceNumber || undefined,
      declarationData: d,
    })),
    ...journalEntries
      .filter((e) => !e.bankTransaction)
      .map((e) => ({
        id: e.id,
        type: "entry" as const,
        date: e.date,
        amount: e.amount,
        description: e.description,
        reference: e.reference,
      })),
  ];

  const used = new Set<string>();

  const resultsData = rows.map((row) => {
    let bestTarget: TargetItem | null = null;
    let bestScore = 0;

    for (const target of targets) {
      if (used.has(target.id)) continue;
      const score = calculateScore(row, target);
      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }

    if (bestTarget && bestScore >= 80) {
      used.add(bestTarget.id);
    }

    return { row, matchedTarget: bestScore >= 80 ? bestTarget : null, score: bestScore };
  });

  const matchedCount = resultsData.filter((r) => r.score >= 80).length;

  // Create BankStatementImport record
  const bankImport = await db.bankStatementImport.create({
    data: {
      filename: fileName,
      format: isCsv ? "csv" : "pdf",
      rowCount: rows.length,
      matchedCount,
      companyId,
    },
  });

  // Create BankTransaction records with status & ReconciliationMatch
  const createdTransactions = await db.$transaction(
    async (tx) => {
      const txs = [];
      for (const { row, matchedTarget, score } of resultsData) {
        const isMatched = score >= 80;
        let entryId: string | undefined = undefined;

        if (isMatched && matchedTarget?.type === "declaration") {
          const decl = matchedTarget.declarationData;
          // Create the JournalEntry 512 in Comptabilité for this payment
          const isCredit = row.amount < 0;
          const newEntry = await tx.journalEntry.create({
            data: {
              date: new Date(row.date),
              description: `Règlement client Facture ${decl.invoice?.invoiceNumber || decl.invoiceId} - ${row.description}`,
              debitAccount: isCredit ? "411" : "512",
              creditAccount: isCredit ? "512" : "411",
              amount: Math.abs(row.amount),
              reference: row.reference || decl.reference || row.chequeNumber || null,
              status: "VALIDATED",
              source: "BANQUE",
              journalType: "BANQUE",
              companyId,
              documentId: decl.invoice?.documentId || null,
              validatedById: user.userId,
              validatedAt: new Date(),
            },
          });
          entryId = newEntry.id;

          // Update declaration to VALIDATED
          await tx.paymentDeclaration.update({
            where: { id: decl.id },
            data: { status: "VALIDATED" },
          });

          // Check invoice total payments and update invoice status
          const inv = await tx.invoice.findUnique({
            where: { id: decl.invoiceId },
            include: { payments: true },
          });
          if (inv) {
            const currentPaid = (inv.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
            const totalPaid = currentPaid + Math.abs(row.amount);
            const newStatus = totalPaid >= inv.amount ? "PAID" : "PARTIALLY_PAID";
            await tx.invoice.update({
              where: { id: decl.invoiceId },
              data: { status: newStatus },
            });
          }
        } else if (isMatched && matchedTarget?.type === "entry") {
          entryId = matchedTarget.id;
        }

        const bTx = await tx.bankTransaction.create({
          data: {
            date: new Date(row.date),
            description: row.description,
            amount: row.amount,
            chequeNumber: row.chequeNumber ?? null,
            reference: row.reference ?? null,
            senderName: row.senderName ?? null,
            balance: row.balance ?? null,
            matched: isMatched,
            matchScore: score,
            matchStatus: isMatched ? "MATCHED" : "BANK_ONLY",
            matchReason: isMatched ? `Correspondance automatique (${score}%)` : "Non rapproché en comptabilité",
            matchedAt: isMatched ? new Date() : null,
            companyId,
            importId: bankImport.id,
            journalEntryId: entryId,
          },
        });

        // Create InvoicePayment if matched to declaration
        if (isMatched && matchedTarget?.type === "declaration") {
          const decl = matchedTarget.declarationData;
          await tx.invoicePayment.create({
            data: {
              invoiceId: decl.invoiceId,
              bankTransactionId: bTx.id,
              declarationId: decl.id,
              amount: Math.abs(row.amount),
            },
          });
        }

        // Create ReconciliationMatch record for full auditability
        if (isMatched && entryId) {
          await tx.reconciliationMatch.create({
            data: {
              bankTransactionId: bTx.id,
              journalEntryId: entryId,
              status: "MATCHED",
              score,
              reason: matchedTarget?.type === "declaration"
                ? `Rapprochement automatique sur déclaration (${score}%)`
                : `Rapprochement automatique (${score}%)`,
              matchedById: user.userId,
            },
          });
        }

        txs.push(bTx);
      }
      return txs;
    }
  );

  const results = resultsData.map(({ row, matchedTarget, score }, index) => ({
    id: createdTransactions[index].id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    chequeNumber: row.chequeNumber ?? null,
    reference: row.reference ?? null,
    matchScore: score,
    matched: score >= 80,
    matchStatus: score >= 80 ? "MATCHED" : "BANK_ONLY",
    matchedTarget: matchedTarget
      ? {
          id: matchedTarget.id,
          type: matchedTarget.type,
          description: matchedTarget.description,
          amount: matchedTarget.amount,
          reference: matchedTarget.reference,
        }
      : undefined,
  }));

  const totalEcart = results.filter((r) => !r.matched).reduce((s, r) => s + Math.abs(r.amount), 0);

  return Response.json({
    importId: bankImport.id,
    total: results.length,
    matched: matchedCount,
    unmatched: results.length - matchedCount,
    totalEcart,
    results,
  });
}
