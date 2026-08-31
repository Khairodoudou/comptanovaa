/**
 * TAYSIR COMPTA — Règles Fiscales Algériennes (Configurables)
 * 
 * Support des 2 régimes principaux :
 * 1. FORFAITAIRE (IFU + G50 IRG Salaires trimestriel)
 * 2. RÉEL (TVA G50 mensuel + IRG Salaires mensuel + IBS 3 acomptes + G4 déclaration annuelle + solde)
 */

export interface DefaultFiscalRuleConfig {
  regimeFiscal: "FORFAITAIRE" | "REEL";
  taxType: string;
  label: string;
  form: string;
  frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "ONCE";
  description: string;
  dueDay?: number;
  dueMonth?: number;
  offsetMonths?: number;
}

export const DEFAULT_FISCAL_RULES: DefaultFiscalRuleConfig[] = [
  // ──────────────── RÉGIME FORFAITAIRE — IFU ────────────────
  {
    regimeFiscal: "FORFAITAIRE",
    taxType: "G12_PREVISIONNELLE",
    label: "G12 — Déclaration prévisionnelle IFU (50%)",
    form: "G12",
    frequency: "ANNUAL",
    description: "Déclaration prévisionnelle du chiffre d'affaires et paiement de 50% de l'impôt forfaitaire",
    dueDay: 30,
    dueMonth: 6, // 30 Juin N
  },
  {
    regimeFiscal: "FORFAITAIRE",
    taxType: "IFU_TRANCHE2",
    label: "IFU — 2ème tranche (25%)",
    form: "G12",
    frequency: "ANNUAL",
    description: "Paiement de la 2ème tranche de 25% de l'impôt forfaitaire",
    dueDay: 15,
    dueMonth: 9, // 15 Septembre N
  },
  {
    regimeFiscal: "FORFAITAIRE",
    taxType: "IFU_TRANCHE3",
    label: "IFU — 3ème tranche (25%)",
    form: "G12",
    frequency: "ANNUAL",
    description: "Paiement de la 3ème tranche de 25% de l'impôt forfaitaire",
    dueDay: 15,
    dueMonth: 12, // 15 Décembre N
  },
  {
    regimeFiscal: "FORFAITAIRE",
    taxType: "G12_BIS_DEFINITIVE",
    label: "G12 Bis — Déclaration définitive CA",
    form: "G12 Bis",
    frequency: "ANNUAL",
    description: "Déclaration définitive du chiffre d'affaires réalisé au titre de l'exercice N-1",
    dueDay: 20,
    dueMonth: 1, // 20 Janvier N+1
  },
  {
    regimeFiscal: "FORFAITAIRE",
    taxType: "G50_IRG_TRIMESTRIEL",
    label: "G50 — IRG Salaires (Trimestriel)",
    form: "G50",
    frequency: "QUARTERLY",
    description: "Déclaration et versement de l'IRG Salaires du trimestre précédent",
    dueDay: 20,
  },

  // ──────────────── RÉGIME RÉEL ────────────────
  {
    regimeFiscal: "REEL",
    taxType: "G50_TVA_MENSUEL",
    label: "G50 — TVA & Taxes assimilées (Mensuel)",
    form: "G50",
    frequency: "MONTHLY",
    description: "Déclaration mensuelle de TVA du 1er au 20 du mois suivant",
    dueDay: 20,
    offsetMonths: 1,
  },
  {
    regimeFiscal: "REEL",
    taxType: "G50_IRG_MENSUEL",
    label: "G50 — IRG Salaires (Mensuel)",
    form: "G50",
    frequency: "MONTHLY",
    description: "Paiement mensuel de l'IRG sur salaires du 1er au 20 du mois suivant",
    dueDay: 20,
    offsetMonths: 1,
  },
  {
    regimeFiscal: "REEL",
    taxType: "IBS_ACOMPTE1",
    label: "IBS — Acompte n°1 (30%)",
    form: "G50 / Bordereau",
    frequency: "ANNUAL",
    description: "Premier acompte provisionnel de l'Impôt sur les Bénéfices des Sociétés",
    dueDay: 20,
    dueMonth: 3, // 20 Mars N
  },
  {
    regimeFiscal: "REEL",
    taxType: "IBS_G4_LIASSE",
    label: "G4 — Déclaration annuelle & Liasse Fiscale",
    form: "G4 + Liasse",
    frequency: "ANNUAL",
    description: "Déclaration annuelle des résultats de l'exercice N-1 et liasse fiscale",
    dueDay: 30,
    dueMonth: 4, // 30 Avril N
  },
  {
    regimeFiscal: "REEL",
    taxType: "IBS_SOLDE",
    label: "IBS — Solde de liquidation",
    form: "Bordereau",
    frequency: "ANNUAL",
    description: "Paiement du solde de liquidation de l'IBS",
    dueDay: 20,
    dueMonth: 5, // 20 Mai N
  },
  {
    regimeFiscal: "REEL",
    taxType: "IBS_ACOMPTE2",
    label: "IBS — Acompte n°2 (35%)",
    form: "Bordereau",
    frequency: "ANNUAL",
    description: "Deuxième acompte provisionnel de l'IBS",
    dueDay: 20,
    dueMonth: 6, // 20 Juin N
  },
  {
    regimeFiscal: "REEL",
    taxType: "IBS_ACOMPTE3",
    label: "IBS — Acompte n°3 (35%)",
    form: "Bordereau",
    frequency: "ANNUAL",
    description: "Troisième acompte provisionnel de l'IBS",
    dueDay: 20,
    dueMonth: 11, // 20 Novembre N
  },
];
