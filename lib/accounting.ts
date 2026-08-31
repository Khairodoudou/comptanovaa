import { db } from "@/lib/db";

// ─── Algerian SCF Standard Account Titles ────────────────────────────────────
export const SCF_ACCOUNT_LABELS: Record<string, string> = {
  // Classe 3 : Comptes de stocks et en-cours
  "30": "Stocks de marchandises",
  "300": "Marchandises stockées",
  "31": "Matières premières et fournitures",
  "38": "Achats stockés",
  "380": "Achats de marchandises",
  "381": "Achats de matières premières",

  // Classe 4 : Comptes de tiers
  "401": "Fournisseurs",
  "4010": "Fournisseurs de biens et services",
  "404": "Fournisseurs d'immobilisations",
  "411": "Clients",
  "4110": "Clients - Ventes de biens et services",
  "421": "Personnel - Rémunérations dues",
  "431": "Sécurité sociale (CNAS / CASNOS)",
  "444": "État - Impôts sur les bénéfices (IBS)",
  "445": "État - Taxes sur le chiffre d'affaires",
  "4456": "TVA déductible",
  "44566": "TVA déductible",
  "4457": "TVA collectée",
  "44571": "TVA collectée",
  "4452": "TVA due",

  // Classe 5 : Comptes financiers
  "512": "Banque",
  "5120": "Banques nationales",
  "517": "Autres organismes financiers (CCP)",
  "53": "Caisse",
  "530": "Caisse principale",

  // Classe 6 : Comptes de charges
  "600": "Achats de marchandises vendues",
  "607": "Achats non stockés de matières et fournitures",
  "613": "Locations",
  "615": "Entretien et réparations",
  "616": "Primes d'assurances",
  "623": "Publicité, publications, relations publiques",
  "624": "Transports de biens et collectif du personnel",
  "626": "Frais postaux et de télécommunications",
  "627": "Services bancaires et assimilés",
  "631": "Impôts, taxes et versements assimilés",
  "641": "Rémunérations du personnel",
  "645": "Charges de sécurité sociale et de prévoyance",

  // Classe 7 : Comptes de produits
  "700": "Ventes de marchandises",
  "706": "Prestations de services",
  "707": "Ventes de marchandises",
  "708": "Produits des activités annexes",
};

/**
 * Returns a formal SCF account label for a given account code.
 * If entityName is provided, appends it to third-party accounts (401, 411).
 */
export function getAccountTitle(account: string, entityName?: string): string {
  const clean = account.trim().split(".")[0];
  let label = SCF_ACCOUNT_LABELS[clean] || SCF_ACCOUNT_LABELS[account.trim()];

  if (!label) {
    if (clean.startsWith("380")) label = "Achats de marchandises";
    else if (clean.startsWith("4456")) label = "TVA déductible";
    else if (clean.startsWith("4457")) label = "TVA collectée";
    else if (clean.startsWith("401")) label = "Fournisseur";
    else if (clean.startsWith("411")) label = "Client";
    else if (clean.startsWith("512")) label = "Banque";
    else if (clean.startsWith("53")) label = "Caisse";
    else if (clean.startsWith("607")) label = "Achats non stockés (électricité, eau)";
    else if (clean.startsWith("626")) label = "Frais postaux et télécoms";
    else if (clean.startsWith("600")) label = "Marchandises vendues";
    else if (clean.startsWith("30")) label = "Stock de marchandises";
    else if (clean.startsWith("70")) label = "Vente de marchandises";
    else label = `Compte ${account}`;
  }

  if (entityName && (clean.startsWith("401") || clean.startsWith("411"))) {
    return `${label} (${entityName})`;
  }

  return label;
}

// ─── Account nature ───────────────────────────────────────────────────────────
export function getAccountNature(account: string): "debiteur" | "crediteur" {
  const parent = account.split(".")[0];
  const num = parseInt(parent, 10);
  if (isNaN(num)) return "debiteur";
  if (num >= 100 && num < 200) return "crediteur";
  if (num >= 400 && num <= 409) return "crediteur";
  if (num >= 445 && num <= 449) return "crediteur";
  if (num >= 700 && num < 800) return "crediteur";
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
    startDate = new Date(latestManual.year, latestManual.month - 1, 1);
  }

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
