/**
 * GET /api/comptable/grand-livre?companyId=&month=&year=
 *
 * Returns an array of T-Account objects for every account found in VALIDATED
 * JournalEntries for the given company, month, and year.
 *
 * For each account:
 *   - soldeInitial: from AccountBalance if set manually, otherwise computed
 *                   as soldeFinal of the previous month (recursive calculation)
 *   - movements:    list of VALIDATED JournalEntry rows that hit this account
 *   - totalDebit / totalCredit
 *   - soldeFinal:   computed based on account nature (debiteur / crediteur)
 *   - nature:       "debiteur" | "crediteur"
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAccountNature, computeSoldeFinal, computeOpeningBalance } from "@/lib/accounting";

export const runtime = "nodejs";

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  const month = parseInt(searchParams.get("month") ?? "0", 10);
  const year = parseInt(searchParams.get("year") ?? "0", 10);

  if (!companyId || !month || !year) {
    return NextResponse.json(
      { error: "companyId, month and year are required" },
      { status: 400 }
    );
  }

  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
    select: { id: true, name: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 403 });
  }

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 1);

  // Fetch all VALIDATED entries for this month + company.
  const entries = await db.journalEntry.findMany({
    where: {
      status: "VALIDATED",
      date: { gte: startOfMonth, lt: endOfMonth },
      OR: [
        { companyId },
        { document: { companyId } },
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
      companyId: true,
      document: { select: { companyId: true } },
    },
  });

  const cleanEntries = entries
    .filter((e) => e.companyId === companyId || e.document?.companyId === companyId)
    .map(({ document: _doc, companyId: _cid, ...rest }) => rest);

  // Find other months that have validated entries for this company
  const allValidatedCompanyEntries = await db.journalEntry.findMany({
    where: {
      status: "VALIDATED",
      OR: [
        { companyId },
        { document: { companyId } },
      ],
    },
    select: { date: true },
    orderBy: { date: "desc" },
  });

  const availableMonthsMap = new Map<string, { year: number; month: number }>();
  for (const e of allValidatedCompanyEntries) {
    const d = new Date(e.date);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${m}`;
    if (!availableMonthsMap.has(key)) {
      availableMonthsMap.set(key, { year: y, month: m });
    }
  }
  const availableMonths = Array.from(availableMonthsMap.values());


  // Collect all unique account codes mentioned
  const accountSet = new Set<string>();
  for (const e of cleanEntries) {
    accountSet.add(e.debitAccount);
    accountSet.add(e.creditAccount);
  }

  // Fetch manual AccountBalance overrides for this month
  const manualBalances = await db.accountBalance.findMany({
    where: { companyId, month, year },
  });
  const manualMap = new Map<string, number>(manualBalances.map((b) => [b.account, b.soldeInitial] as [string, number]));

  // Build T-Account for each unique account
  const accounts = await Promise.all(
    Array.from(accountSet)
      .sort()
      .map(async (account) => {
        const nature = getAccountNature(account);

        const debitMovements = cleanEntries
          .filter((e) => e.debitAccount === account)
          .map((e) => ({ ...e, side: "debit" as const }));

        const creditMovements = cleanEntries
          .filter((e) => e.creditAccount === account)
          .map((e) => ({ ...e, side: "credit" as const }));

        const totalDebit = debitMovements.reduce((s, e) => s + e.amount, 0);
        const totalCredit = creditMovements.reduce((s, e) => s + e.amount, 0);

        let soldeInitial: number;
        if (manualMap.has(account)) {
          soldeInitial = manualMap.get(account) as number;
        } else {
          soldeInitial = await computeOpeningBalance(account, month, year, companyId);
        }

        const soldeFinal = computeSoldeFinal(nature, soldeInitial, totalDebit, totalCredit);

        const allMovements = [
          ...debitMovements,
          ...creditMovements,
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {
          account,
          nature,
          soldeInitial,
          soldeFinal,
          totalDebit,
          totalCredit,
          movements: allMovements,
          hasManualBalance: manualMap.has(account),
        };
      })
  );

  return NextResponse.json({
    company,
    month,
    year,
    accounts,
    availableMonths,
  });
}
