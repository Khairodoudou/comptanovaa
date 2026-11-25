/**
 * Shared bank reconciliation matching and persistence engine.
 * Used by both automatic import (/api/bank/reconcile) and manual entry (/api/bank/reconcile/manual).
 */
import { db } from "@/lib/db";

export interface ReconcileInputRow {
  date: string;
  description: string;
  amount: number;
  chequeNumber?: string;
  reference?: string;
  senderName?: string;
  balance?: number;
}

interface TargetItem {
  id: string;
  type: "declaration" | "entry";
  date: Date;
  amount: number;
  description: string;
  reference: string | null;
  clientName?: string;
  invoiceNumber?: string;
  declarationData?: any;
}

export function extractChequeFromText(text: string): string | null {
  const match = text.match(/(?:ch[eè]que?|chq|n[°o]\.?|#)\s*(\d{4,})/i);
  return match ? match[1] : null;
}

export function extractRefFromText(text: string): string | null {
  const match = text.match(/(?:ref|virement|vir|ref:|n°)\s*([a-z0-9\-]{5,})/i);
  return match ? match[1] : null;
}

function datesMatch(a: Date, b: Date, maxDays = 3): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= maxDays * 24 * 60 * 60 * 1000;
}

function amountsMatch(a: number, b: number, tolerancePct = 0.01): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1) <= tolerancePct;
}

function calculateScore(row: ReconcileInputRow, target: TargetItem): number {
  const rowDate = new Date(row.date);
  const absAmount = Math.abs(row.amount);
  const amountEqual = amountsMatch(target.amount, absAmount);
  const dateEqual = datesMatch(target.date, rowDate, 3);
  const dateClose = datesMatch(target.date, rowDate, 7);

  const refMatch =
    (row.chequeNumber && target.reference && target.reference.includes(row.chequeNumber)) ||
    (row.reference && target.reference && target.reference.toLowerCase() === row.reference.toLowerCase()) ||
    (row.reference && target.reference && target.reference.toLowerCase().includes(row.reference.toLowerCase())) ||
    (target.invoiceNumber && row.description.toLowerCase().includes(target.invoiceNumber.toLowerCase()));

  const clientMatch = target.clientName && row.description.toLowerCase().includes(target.clientName.toLowerCase());

  if (amountEqual && refMatch && dateEqual) return 100;
  if (amountEqual && (refMatch || dateEqual)) return 95;
  if (amountEqual && (clientMatch || dateClose)) return 80;
  if (amountEqual) return 80;

  return 0;
}

export async function reconcileAndPersistTransactions(params: {
  companyId: string;
  userId: string;
  filename: string;
  format: string;
  rows: ReconcileInputRow[];
  unmatchedReason?: string;
}) {
  const {
    companyId,
    userId,
    filename,
    format,
    rows,
    unmatchedReason = "Non rapproché en comptabilité",
  } = params;

  const normalizedRows: ReconcileInputRow[] = rows.map((r) => ({
    ...r,
    chequeNumber: r.chequeNumber || extractChequeFromText(r.description) || undefined,
    reference: r.reference || extractRefFromText(r.description) || undefined,
  }));

  // 1. Only PENDING_CONFIRMATION declarations (CONFIRMED ones already have JournalEntries)
  const pendingDeclarations = await db.paymentDeclaration.findMany({
    where: {
      invoice: { companyId },
      status: "PENDING_CONFIRMATION",
      accountingEntryId: null,
    },
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
  const resultsData = normalizedRows.map((row) => {
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

  const bankImport = await db.bankStatementImport.create({
    data: {
      filename,
      format,
      rowCount: normalizedRows.length,
      matchedCount,
      companyId,
    },
  });

  const createdTransactions = await db.$transaction(async (tx) => {
    const txs = [];
    for (const { row, matchedTarget, score } of resultsData) {
      const isMatched = score >= 80;
      let entryId: string | undefined = undefined;

      if (isMatched && matchedTarget?.type === "declaration") {
        const decl = matchedTarget.declarationData;
        const existingEntry = decl.accountingEntryId
          ? await tx.journalEntry.findFirst({ where: { id: decl.accountingEntryId } })
          : null;

        if (!existingEntry) {
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
              validatedById: userId,
              validatedAt: new Date(),
            },
          });
          entryId = newEntry.id;

          await (tx as any).paymentDeclaration.update({
            where: { id: decl.id },
            data: {
              status: "CONFIRMED",
              confirmedAt: new Date(),
              confirmedById: userId,
              accountingEntryId: newEntry.id,
            },
          });
        } else {
          entryId = existingEntry.id;
        }

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
          matchReason: isMatched ? `Correspondance automatique (${score}%)` : unmatchedReason,
          matchedAt: isMatched ? new Date() : null,
          companyId,
          importId: bankImport.id,
          journalEntryId: entryId,
        },
      });

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

      if (isMatched && entryId) {
        await tx.reconciliationMatch.create({
          data: {
            bankTransactionId: bTx.id,
            journalEntryId: entryId,
            status: "MATCHED",
            score,
            reason:
              matchedTarget?.type === "declaration"
                ? `Rapprochement automatique sur déclaration (${score}%)`
                : `Rapprochement automatique (${score}%)`,
            matchedById: userId,
          },
        });
      }

      txs.push(bTx);
    }
    return txs;
  });

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

  const totalEcart = results
    .filter((r) => !r.matched)
    .reduce((s, r) => s + Math.abs(r.amount), 0);

  return {
    importId: bankImport.id,
    total: results.length,
    matched: matchedCount,
    unmatched: results.length - matchedCount,
    totalEcart,
    results,
  };
}
