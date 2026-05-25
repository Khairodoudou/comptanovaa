import { db } from "@/lib/db";

// ─── Account nature ───────────────────────────────────────────────────────────
// Simplified Algerian PCG rules:
//   Créditeur: 1xx (capitaux), 40x (fournisseurs), 44x (TVA collectée 7xx), 7xx (produits)
//   Débiteur: everything else (2xx actifs, 3xx stocks, 41x clients, 5xx trésorerie, 6xx charges)
export function getAccountNature(account: string): "debiteur" | "crediteur" {
  const parent = account.split(".")[0]; // support sub-accounts like 380.0
  const num = parseInt(parent, 10);
  if (isNaN(num)) return "debiteur";
  // 1xx: capitaux propres & dettes long terme → créditeur
  if (num >= 100 && num < 200) return "crediteur";
  // 40x: fournisseurs → créditeur
  if (num >= 400 && num <= 409) return "crediteur";
  // 44x (TVA): depends but 4456/44566 are créditeur (TVA collectée)
  if (num >= 445 && num <= 449) return "crediteur";
  // 7xx: produits → créditeur
  if (num >= 700 && num < 800) return "crediteur";
  // Everything else: débiteur
  return "debiteur";
}

export function computeSoldeFinal(
  nature: "debiteur" | "crediteur",
  soldeInitial: number,
  totalDebit: number,
  totalCredit: number
): number {
  if (nature === "debiteur") {
    return soldeInitial + totalDebit - totalCredit;
  }
  return soldeInitial + totalCredit - totalDebit;
}

// ─── Compute opening balance from previous months ─────────────────────────────
export async function computeOpeningBalance(
  account: string,
  month: number,
  year: number,
  companyId: string
): Promise<number> {
  // Find the most recent manual balance strictly before the requested month/year
  const manualBalances = await db.accountBalance.findMany({
    where: {
      account,
      companyId,
      OR: [
        { year: { lt: year } },
        { year: year, month: { lt: month } }
      ]
    },
    orderBy: [
      { year: 'desc' },
      { month: 'desc' }
    ],
    take: 1
  });

  const latestManual = manualBalances[0];
  let startDate: Date | undefined;
  let baseBalance = 0;

  if (latestManual) {
    baseBalance = latestManual.soldeInitial;
    // The manual balance is the OPENING balance of that past month.
    // So we must sum all entries starting FROM that month up to the current month.
    startDate = new Date(latestManual.year, latestManual.month - 1, 1);
  }

  // End of period is the START of the requested month
  const endOfPeriod = new Date(year, month - 1, 1);

  const dateFilter: any = { lt: endOfPeriod };
  if (startDate) {
    dateFilter.gte = startDate;
  }

  const prevEntries = await db.journalEntry.findMany({
    where: {
      status: "VALIDATED",
      date: dateFilter,
      OR: [{ debitAccount: account }, { creditAccount: account }],
      document: { companyId },
    },
    select: { debitAccount: true, creditAccount: true, amount: true },
  });

  const nature = getAccountNature(account);
  const prevTotalDebit = prevEntries
    .filter((e) => e.debitAccount === account)
    .reduce((s, e) => s + e.amount, 0);
  const prevTotalCredit = prevEntries
    .filter((e) => e.creditAccount === account)
    .reduce((s, e) => s + e.amount, 0);

  return computeSoldeFinal(nature, baseBalance, prevTotalDebit, prevTotalCredit);
}
