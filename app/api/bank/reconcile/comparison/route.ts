/**
 * GET /api/bank/reconcile/comparison?companyId=xxx&month=1&year=2026
 * Returns a structured comparison between:
 *   - Journal entries on account 512 (Comptabilité)
 *   - Bank transactions for the same company/period
 * Each item has a "status": MATCHED | ACCOUNTING_ONLY | BANK_ONLY | IGNORED
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
      documentId: true,
      document: {
        select: {
          id: true,
          originalName: true,
          fileBase64: true,
          ocrData: true,
          invoice: {
            select: { id: true, invoiceNumber: true, amount: true, status: true },
          },
        },
      },
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
      invoicePayments: {
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              amount: true,
              documentId: true,
              document: { select: { id: true, originalName: true, fileBase64: true } },
            },
          },
          declaration: { select: { id: true, reference: true, justificatif: true } },
        },
      },
    },
  });

  // Get all company invoices to resolve documents linked by reference/description
  const companyInvoices = await db.invoice.findMany({
    where: { companyId },
    select: {
      id: true,
      invoiceNumber: true,
      documentId: true,
      document: { select: { id: true, originalName: true, fileBase64: true } },
    },
  });

  // Build comparison rows
  const rows: any[] = [];

  // 1. Accounting side (journal entries 512)
  for (const entry of journalEntries) {
    const linkedBankTx = bankTransactions.find((bt) => bt.journalEntryId === entry.id);
    const isDebit = entry.debitAccount === "512";
    const isMatched = !!linkedBankTx;

    const invPay = linkedBankTx?.invoicePayments?.[0];
    const fallbackInv = !entry.documentId && !invPay?.invoice?.documentId
      ? companyInvoices.find((inv) =>
          inv.invoiceNumber &&
          (entry.reference?.toLowerCase().includes(inv.invoiceNumber.toLowerCase()) ||
           entry.description?.toLowerCase().includes(inv.invoiceNumber.toLowerCase()) ||
           linkedBankTx?.reference?.toLowerCase().includes(inv.invoiceNumber.toLowerCase()) ||
           linkedBankTx?.description?.toLowerCase().includes(inv.invoiceNumber.toLowerCase()))
        )
      : null;

    const resolvedDocId = entry.documentId || invPay?.invoice?.documentId || fallbackInv?.documentId || null;
    const resolvedDocName = entry.document?.originalName || invPay?.invoice?.document?.originalName || fallbackInv?.document?.originalName || null;
    const resolvedInvoiceNumber = entry.document?.invoice?.invoiceNumber || invPay?.invoice?.invoiceNumber || fallbackInv?.invoiceNumber || null;
    const resolvedJustificatif = invPay?.declaration?.justificatif || null;

    rows.push({
      id: `acc-${entry.id}`,
      date: entry.date,
      source: "ACCOUNTING",
      status: isMatched ? "MATCHED" : "ACCOUNTING_ONLY",
      correspondance: linkedBankTx?.chequeNumber
        ? `CHQ ${linkedBankTx.chequeNumber}`
        : linkedBankTx?.reference || entry.reference || "—",
      amountAccounting: entry.amount,
      amountBank: linkedBankTx ? linkedBankTx.amount : null,
      accounting: {
        id: entry.id,
        date: entry.date,
        description: entry.description,
        debit: isDebit ? entry.amount : 0,
        credit: !isDebit ? entry.amount : 0,
        reference: entry.reference,
        documentId: resolvedDocId,
        originalName: resolvedDocName,
        hasFile: !!(entry.document?.fileBase64 || invPay?.invoice?.document?.fileBase64 || fallbackInv?.document?.fileBase64 || resolvedDocId),
        invoiceNumber: resolvedInvoiceNumber,
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
            matchReason: linkedBankTx.matchReason,
            invoiceNumber: resolvedInvoiceNumber,
            justificatif: resolvedJustificatif,
            documentId: resolvedDocId,
            originalName: resolvedDocName,
          }
        : null,
    });
  }

  // 2. Bank-only transactions (not linked to any journal entry)
  for (const bt of bankTransactions) {
    const alreadyInRows = rows.some((r) => r.bank?.id === bt.id);
    if (!alreadyInRows) {
      const isIgnored = bt.matchStatus === "IGNORED";
      const paymentInfo = bt.invoicePayments?.[0];
      const fallbackInv = !paymentInfo?.invoice?.documentId
        ? companyInvoices.find((inv) =>
            inv.invoiceNumber &&
            (bt.reference?.toLowerCase().includes(inv.invoiceNumber.toLowerCase()) ||
             bt.description?.toLowerCase().includes(inv.invoiceNumber.toLowerCase()))
          )
        : null;

      const bankDocId = paymentInfo?.invoice?.documentId || fallbackInv?.documentId || null;
      const bankDocName = paymentInfo?.invoice?.document?.originalName || fallbackInv?.document?.originalName || null;
      const bankInvNum = paymentInfo?.invoice?.invoiceNumber || fallbackInv?.invoiceNumber || null;

      rows.push({
        id: `bank-${bt.id}`,
        date: bt.date,
        source: "BANK",
        status: isIgnored ? "IGNORED" : "BANK_ONLY",
        correspondance: bt.chequeNumber
          ? `CHQ ${bt.chequeNumber}`
          : bt.reference || paymentInfo?.declaration?.reference || "—",
        amountAccounting: null,
        amountBank: bt.amount,
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
          matchReason: bt.matchReason,
          importFile: bt.import?.filename,
          invoiceNumber: bankInvNum,
          justificatif: paymentInfo?.declaration?.justificatif,
          documentId: bankDocId,
          originalName: bankDocName,
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

  // Calculate opening balances & final balances for Account 512
  const { computeOpeningBalance, computeSoldeFinal, getAccountNature } = await import("@/lib/accounting");
  const soldeInitial512 = await computeOpeningBalance("512", month, year, companyId);
  const totalDebit512 = journalEntries.filter((e) => e.debitAccount === "512").reduce((sum, e) => sum + e.amount, 0);
  const totalCredit512 = journalEntries.filter((e) => e.creditAccount === "512").reduce((sum, e) => sum + e.amount, 0);
  const soldeComptable = computeSoldeFinal(getAccountNature("512"), soldeInitial512, totalDebit512, totalCredit512);

  // Bank balance: check if last transaction in the month has a running balance, otherwise compute from movements
  const totalBankMoves = bankTransactions
    .filter((bt) => bt.matchStatus !== "IGNORED")
    .reduce((sum, bt) => sum + bt.amount, 0);
  const lastTxWithBalance = [...bankTransactions].reverse().find((bt) => bt.balance !== null && bt.balance !== undefined);
  const soldeBancaire = lastTxWithBalance?.balance !== null && lastTxWithBalance?.balance !== undefined
    ? lastTxWithBalance.balance
    : (soldeInitial512 + totalBankMoves);

  const ecart = soldeComptable - soldeBancaire;

  // Summary stats
  const matched = rows.filter((r) => r.status === "MATCHED").length;
  const accountingOnly = rows.filter((r) => r.status === "ACCOUNTING_ONLY").length;
  const bankOnly = rows.filter((r) => r.status === "BANK_ONLY").length;
  const ignored = rows.filter((r) => r.status === "IGNORED").length;

  return Response.json({
    rows,
    summary: {
      matched,
      accountingOnly,
      bankOnly,
      ignored,
      total: rows.length,
      soldeInitial512,
      totalDebit512,
      totalCredit512,
      soldeComptable,
      soldeBancaire,
      ecart,
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
