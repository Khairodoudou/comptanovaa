/**
 * GET /api/bank/reconcile/comparison?companyId=xxx&month=1&year=2026
 * Returns a structured comparison between:
 *   - Journal entries on account 512 (Comptabilité)
 *   - Bank transactions for the same company/period
 * Each item has a "status": MATCHED | ACCOUNTING_ONLY | BANK_ONLY
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const companyId = searchParams.get("companyId");
  const month = parseInt(searchParams.get("month") ?? "1", 10);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);

  if (!companyId) {
    return Response.json({ error: "companyId requis" }, { status: 400 });
  }

  // Verify access
  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });
  if (!company) {
    return Response.json({ error: "Entreprise introuvable" }, { status: 404 });
  }

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 1);

  // Get journal entries on account 512
  const journalEntries = await db.journalEntry.findMany({
    where: {
      status: "VALIDATED",
      date: { gte: startOfMonth, lt: endOfMonth },
      OR: [
        { debitAccount: "512", companyId },
        { creditAccount: "512", companyId },
        { debitAccount: "512", document: { companyId } },
        { creditAccount: "512", document: { companyId } },
      ],
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      description: true,
      debitAccount: true,
      creditAccount: true,
      amount: true,
      reference: true,
      bankTransaction: {
        select: { id: true, matchStatus: true },
      },
    },
  });

  // Get bank transactions
  const bankTransactions = await db.bankTransaction.findMany({
    where: {
      companyId,
      date: { gte: startOfMonth, lt: endOfMonth },
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      chequeNumber: true,
      reference: true,
      senderName: true,
      balance: true,
      matched: true,
      matchStatus: true,
      matchReason: true,
      journalEntryId: true,
      journalEntry: {
        select: { id: true, description: true, amount: true },
      },
      import: {
        select: { filename: true, importedAt: true },
      },
    },
  });

  // Build comparison rows
  const rows: any[] = [];

  // 1. Accounting side (journal entries 512)
  for (const entry of journalEntries) {
    const linkedBankTx = bankTransactions.find((bt) => bt.journalEntryId === entry.id);
    const isDebit = entry.debitAccount === "512";

    rows.push({
      id: `acc-${entry.id}`,
      source: "ACCOUNTING",
      status: linkedBankTx ? "MATCHED" : "ACCOUNTING_ONLY",
      accounting: {
        id: entry.id,
        date: entry.date,
        description: entry.description,
        debit: isDebit ? entry.amount : 0,
        credit: !isDebit ? entry.amount : 0,
        reference: entry.reference,
      },
      bank: linkedBankTx
        ? {
            id: linkedBankTx.id,
            date: linkedBankTx.date,
            description: linkedBankTx.description,
            amount: linkedBankTx.amount,
            chequeNumber: linkedBankTx.chequeNumber,
            reference: linkedBankTx.reference,
            matchStatus: linkedBankTx.matchStatus,
          }
        : null,
    });
  }

  // 2. Bank-only transactions (not linked to any journal entry)
  const linkedJournalIds = new Set(
    bankTransactions.filter((bt) => bt.journalEntryId).map((bt) => bt.journalEntryId)
  );

  for (const bt of bankTransactions) {
    const alreadyInRows = rows.some((r) => r.bank?.id === bt.id);
    if (!alreadyInRows && bt.matchStatus !== "IGNORED") {
      rows.push({
        id: `bank-${bt.id}`,
        source: "BANK",
        status: bt.matchStatus === "MATCHED" || bt.matchStatus === "MANUAL_MATCH" ? "MATCHED" : "BANK_ONLY",
        accounting: null,
        bank: {
          id: bt.id,
          date: bt.date,
          description: bt.description,
          amount: bt.amount,
          chequeNumber: bt.chequeNumber,
          reference: bt.reference,
          senderName: bt.senderName,
          balance: bt.balance,
          matchStatus: bt.matchStatus,
          importFile: bt.import?.filename,
        },
      });
    }
  }

  // Sort all rows by date
  rows.sort((a, b) => {
    const dateA = a.accounting?.date ?? a.bank?.date ?? new Date(0);
    const dateB = b.accounting?.date ?? b.bank?.date ?? new Date(0);
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  // Summary stats
  const matched = rows.filter((r) => r.status === "MATCHED").length;
  const accountingOnly = rows.filter((r) => r.status === "ACCOUNTING_ONLY").length;
  const bankOnly = rows.filter((r) => r.status === "BANK_ONLY").length;

  const totalAccounting = journalEntries.reduce((sum, e) => {
    const isDebit = e.debitAccount === "512";
    return sum + (isDebit ? e.amount : -e.amount);
  }, 0);

  const totalBank = bankTransactions.reduce((sum, bt) => sum + bt.amount, 0);

  return Response.json({
    rows,
    summary: {
      matched,
      accountingOnly,
      bankOnly,
      total: rows.length,
      totalAccounting,
      totalBank,
      ecart: totalAccounting - totalBank,
    },
    bankTransactions: bankTransactions.map((bt) => ({
      id: bt.id,
      date: bt.date,
      description: bt.description,
      amount: bt.amount,
      chequeNumber: bt.chequeNumber,
      reference: bt.reference,
      matchStatus: bt.matchStatus,
    })),
    journalEntries: journalEntries.map((e) => ({
      id: e.id,
      date: e.date,
      description: e.description,
      amount: e.amount,
      debitAccount: e.debitAccount,
      creditAccount: e.creditAccount,
      reference: e.reference,
      linkedBankTx: e.bankTransaction?.id ?? null,
    })),
  });
}
