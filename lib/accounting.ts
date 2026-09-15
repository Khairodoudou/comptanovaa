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
  "512": "Banques",
  "5120": "Banques nationales",
  "517": "Autres organismes financiers (CCP)",
  "53": "Caisses",
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
 * Nettoie les suffixes OCR superflus dans le nom de tiers (ADRESSE :, TEL :, etc.)
 */
export function cleanEntityName(name?: string | null): string {
  if (!name) return "";
  let clean = name.trim();
  // Strip trailing OCR artifacts like "ADRESSE : TEL", "ADRESSE :", "TEL :", "ADR :"
  clean = clean.replace(/\s*(?:ADRESSE|ADR|TEL|TÉLÉPHONE|TELEPHONE)\s*:\s*(?:TEL\s*:?)?\s*$/i, "").trim();
  clean = clean.replace(/\s+(?:ADRESSE\s*:?|TEL\s*:?|TÉLÉPHONE\s*:?)+$/i, "").trim();
  return clean;
}

/**
 * Détermine dynamiquement le préfixe de référence comptable (BL N°, BC N°, BR N°, BS N°, Chèque N°, etc.)
 */
export function getRefLabel(
  reference?: string | null,
  docType?: string | null,
  originalDesc?: string
): string {
  const ref = (reference || "").toUpperCase().trim();
  const type = (docType || "").toUpperCase().trim();
  const desc = (originalDesc || "").toLowerCase();

  // 1. Chèque (checked first to avoid confusion with invoice prefixes in payment descriptions)
  if (
    ref.startsWith("CHQ") ||
    ref.startsWith("CH") ||
    type.includes("CHEQUE") ||
    desc.includes("chèque") ||
    desc.includes("cheque")
  ) {
    return "Chèque N°";
  }

  // 2. Règlement / virement / bancaire
  if (
    desc.includes("règlement") ||
    desc.includes("reglement") ||
    desc.includes("virement") ||
    type.includes("BANCAIRE")
  ) {
    return "Règlement N°";
  }

  // 3. Bon de livraison (BL)
  if (ref.startsWith("BL") || type.includes("LIVRAISON") || desc.includes("livraison")) {
    return "BL N°";
  }

  // 4. Bon de commande (BC)
  if (ref.startsWith("BC") || type.includes("COMMANDE") || desc.includes("bon de commande")) {
    return "BC N°";
  }

  // 5. Bon de réception (BR)
  if (ref.startsWith("BR") || type.includes("RECEPTION") || desc.includes("réception") || desc.includes("reception")) {
    return "BR N°";
  }

  // 6. Bon de sortie (BS)
  if (ref.startsWith("BS") || type.includes("SORTIE") || desc.includes("bon de sortie") || desc.includes("sortie de stock")) {
    return "BS N°";
  }

  // Par défaut: Facture
  return "Facture N°";
}

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
    else if (clean.startsWith("401")) label = "Fournisseurs";
    else if (clean.startsWith("411")) label = "Clients";
    else if (clean.startsWith("512")) label = "Banques";
    else if (clean.startsWith("53")) label = "Caisses";
    else if (clean.startsWith("607")) label = "Achats non stockés de matières et fournitures";
    else if (clean.startsWith("626")) label = "Frais postaux et de télécommunications";
    else if (clean.startsWith("600")) label = "Achats de marchandises vendues";
    else if (clean.startsWith("30")) label = "Stocks de marchandises";
    else if (clean.startsWith("70")) label = "Ventes de marchandises";
    else label = `Compte ${account}`;
  }

  const cleanedEntity = cleanEntityName(entityName);
  if (cleanedEntity && (clean.startsWith("401") || clean.startsWith("411"))) {
    return `${label} (${cleanedEntity})`;
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
      AND: [
        {
          OR: [{ companyId }, { document: { companyId } }],
        },
      ],
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
