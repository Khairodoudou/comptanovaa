import { EntrySpec, generateEntries, findSubAccount, TVA_RATE } from "./entry-generator";
import { findAccountingMemory, AccountingMemoryMatch } from "./accounting-memory";
import { generateAccountingWithAi } from "./ai-accounting-engine";

export interface SmartEntryOptions {
  companyId: string;
  companyName?: string;
  docType: string;
  amountTTC: number;
  supplier: string;
  refNumber: string | null;
  rawDesc?: string;
  subAccounts?: { parentAccount: string; subAccount: string; name: string }[];
  htOverride?: number;
  tvaOverride?: number;
  regimeFiscal?: string | null;
}

export interface SmartEntryResult {
  entries: EntrySpec[];
  source: "MEMORY" | "AI" | "FALLBACK";
  memoryMatch?: AccountingMemoryMatch | null;
  explanation?: string;
}

/**
 * Intelligent Entry Generator combining:
 * 1. Accountant Preference Memory (Learns from previous accountant corrections)
 * 2. Gemini AI Accounting Engine (SCF Algérien domain knowledge)
 * 3. Deterministic SCF Rule-based Fallback
 */
export async function generateSmartEntries(
  options: SmartEntryOptions
): Promise<SmartEntryResult> {
  const {
    companyId,
    companyName,
    docType,
    amountTTC,
    supplier,
    refNumber,
    rawDesc = "",
    subAccounts = [],
    htOverride,
    tvaOverride,
    regimeFiscal,
  } = options;

  const isIfu = Boolean(
    regimeFiscal &&
      (regimeFiscal.toUpperCase().includes("FORFAIT") ||
        regimeFiscal.toUpperCase().includes("IFU"))
  );

  // ── RÈGLES MÉTIER SCF STRICTES (Non polluées par la mémoire de charge) ──────
  // 1. CHEQUE — Deux sens possibles selon SCF Algérien :
  //    a) Chèque REÇU d'un client  → Débit 512 (Banque) / Crédit 411 (Client)   [Encaissement]
  //    b) Chèque ÉMIS à un fournisseur → Débit 401 (Fournisseur) / Crédit 512 (Banque) [Règlement]
  //
  // Détection : si le bénéficiaire "À l'ordre de" est la propre société → chèque reçu.
  if (docType === "CHEQUE") {
    // ── Detect cheque direction (received vs issued) ──────────────────────────
    const hasSaleKeyword = /vente|encaiss|recu|re\u00e7u|client|recette/i.test(rawDesc);
    const hasPurchaseKeyword = /reglement|paiement|fournisseur|achat|charge/i.test(rawDesc);

    const beneficiaryMatch = rawDesc.match(
      /(?:[Àà]\s+l[''']ordre\s+de|A\s+l[''']ordre\s+de|ordre\s+de\s+paiement|payable\s+[àa])\s*[:\-–]?\s*([^\n\r,=]{3,80})/i
    );
    const beneficiary = (beneficiaryMatch?.[1] || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

    // Normalize company name for comparison (strip SARL/EURL prefixes, accents)
    const companyNorm = (companyName || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\b(sarl|eurl|spa|snc|ets|ste)\b/gi, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();

    // Consider cheque RECEIVED if sale keyword in rawDesc OR beneficiary text contains company name
    const isReceivedCheque =
      hasSaleKeyword ||
      (!hasPurchaseKeyword &&
        companyNorm.length >= 4 &&
        beneficiary.length >= 4 &&
        (beneficiary.includes(companyNorm) || companyNorm.includes(beneficiary.substring(0, Math.min(beneficiary.length, 12)))));

    if (isReceivedCheque) {
      // ── Encaissement client : Débit 512 (Banque) / Crédit 411 (Client) ──────
      const acc512 = findSubAccount(subAccounts, "512", "Banque");
      const acc411 = findSubAccount(subAccounts, "411", supplier);
      const creditAccount = acc411 === "411" ? "411.0" : acc411;
      return {
        source: "FALLBACK",
        explanation: `Encaissement client par chèque N° ${refNumber || ""} — Débit ${acc512} (Banque) / Crédit ${creditAccount} (Client) pour ${amountTTC} DA (Règle SCF obligatoire).`,
        entries: [
          {
            debitAccount: acc512,
            creditAccount,
            amount: amountTTC,
            description: `Encaissement client — ${supplier}`,
            reference: refNumber,
          },
        ],
      };
    } else {
      // ── Règlement fournisseur : Débit 401 (Fournisseur) / Crédit 512 (Banque) ──
      const acc401 = findSubAccount(subAccounts, "401", supplier);
      const debitAccount = acc401 === "401" ? "401.0" : acc401;
      const creditAccount = findSubAccount(subAccounts, "512", "Banque");
      return {
        source: "FALLBACK",
        explanation: `Règlement fournisseur par chèque N° ${refNumber || ""} — Débit ${debitAccount} (Fournisseur) / Crédit ${creditAccount} (Banque) pour ${amountTTC} DA (Règle SCF obligatoire).`,
        entries: [
          {
            debitAccount,
            creditAccount,
            amount: amountTTC,
            description: `Règlement fournisseur — ${supplier}`,
            reference: refNumber,
          },
        ],
      };
    }
  }

  // 2. BON DE RÉCEPTION / ENTRÉE EN STOCK : Débit 30 (Stock) / Crédit 380 (Achat stocké)
  if (docType === "BON_RECEPTION") {
    const acc30 = findSubAccount(subAccounts, "30", supplier);
    const acc380 = findSubAccount(subAccounts, "380", supplier);
    const amount = htOverride && htOverride > 0 && htOverride <= amountTTC ? htOverride : amountTTC;
    return {
      source: "FALLBACK",
      explanation: `Entrée en stock selon bon de réception N° ${refNumber || ""} — Débit ${acc30} (Stocks) / Crédit ${acc380} (Achats de marchandises) pour ${amount} DA HT.`,
      entries: [
        {
          debitAccount: acc30,
          creditAccount: acc380,
          amount,
          description: `Entrée en stock — ${supplier}`,
          reference: refNumber,
        },
      ],
    };
  }

  // 3. BON DE LIVRAISON / SORTIE DE STOCK : Débit 600 / Crédit 30
  if (docType === "BON_LIVRAISON") {
    const acc30 = findSubAccount(subAccounts, "30", supplier);
    const amount = htOverride && htOverride > 0 && htOverride <= amountTTC ? htOverride : amountTTC;
    return {
      source: "FALLBACK",
      explanation: `Sortie de stock selon bon de livraison N° ${refNumber || ""} — Débit 600 / Crédit ${acc30} pour ${amount} DA HT.`,
      entries: [
        {
          debitAccount: "600",
          creditAccount: acc30,
          amount,
          description: `Sortie de stock — ${supplier}`,
          reference: refNumber,
        },
      ],
    };
  }

  // 4. FACTURE ÉLECTRICITÉ, EAU, GAZ (Fluides non stockés : Sonelgaz, SEAAL, ADE, etc.)
  // SCF Algérien direct : Débit 607 (Achat Non stocké : électricité, eau) / Crédit 512 (Banque) pour le montant TTC
  const isUtilityInvoice =
    /sonelgaz|seaal|ade\b|alg[eé]rienne des eaux|[eé]lectricit[eé]|gaz\b|eau potable|facture d['’]eau|facture d['’][eé]lectricit[eé]|facture électricité/i.test(
      `${supplier} ${rawDesc} ${docType}`
    );

  if (isUtilityInvoice) {
    const acc607 = findSubAccount(subAccounts, "607", "Achats non stockés");
    const acc512 = findSubAccount(subAccounts, "512", "Banque");
    return {
      source: "FALLBACK",
      explanation: `Facture électricité / eau N° ${refNumber || ""} — Débit ${acc607} (Achat Non stocké : électricité, eau) / Crédit ${acc512} (Banque) pour ${amountTTC} DA TTC (Règle SCF directe).`,
      entries: [
        {
          debitAccount: acc607,
          creditAccount: acc512,
          amount: amountTTC,
          description: `Achat Non stocké ( électricité, eau) — ${supplier}`,
          reference: refNumber,
        },
      ],
    };
  }

  // 5. FACTURE TÉLÉPHONE, INTERNET, TÉLÉCOMS (Algérie Télécom, Mobilis, Djezzy, Ooredoo, etc.)
  // SCF Algérien direct : Débit 626 (Frais postaux et de télécommunications) / Crédit 512 (Banque) pour le montant TTC
  const isTelecomInvoice =
    /mobilis|djezzy|ooredoo|alg[eé]rie t[eé]l[eé]com|t[eé]l[eé]phone|internet|adsl|fibre|4g|5g|forfait mobile|facture t[eé]l[eé]phone|facture internet|t[eé]l[eé]com/i.test(
      `${supplier} ${rawDesc} ${docType}`
    );

  if (isTelecomInvoice) {
    const acc626 = findSubAccount(subAccounts, "626", "Frais postaux et de télécommunications");
    const acc512 = findSubAccount(subAccounts, "512", "Banque");
    return {
      source: "FALLBACK",
      explanation: `Facture téléphone / internet N° ${refNumber || ""} — Débit ${acc626} (Frais postaux et de télécommunications) / Crédit ${acc512} (Banque) pour ${amountTTC} DA TTC (Règle SCF directe).`,
      entries: [
        {
          debitAccount: acc626,
          creditAccount: acc512,
          amount: amountTTC,
          description: `Frais postaux et de télécommunications — ${supplier}`,
          reference: refNumber,
        },
      ],
    };
  }

  // ── Step 1: Check Accountant Preference Memory (pour Factures / Charges) ──
  let memoryMatch: AccountingMemoryMatch | null = null;
  try {
    memoryMatch = await findAccountingMemory(companyId, supplier, docType);
  } catch (memErr) {
    console.warn("[SmartEntry] Memory lookup warning:", memErr);
  }

  if (memoryMatch && amountTTC > 0) {
    console.log(`[SmartEntry] Found learned accountant preference for ${supplier}: Débit ${memoryMatch.debitAccount}, Crédit ${memoryMatch.creditAccount}`);

    // Si régime IFU ou exonéré
    if (isIfu || memoryMatch.isExempt || memoryMatch.tvaRate === 0) {
      const amount = htOverride && htOverride > 0 && htOverride <= amountTTC ? htOverride : amountTTC;
      return {
        source: "MEMORY",
        memoryMatch,
        explanation: `Appliqué selon vos corrections précédentes pour ${memoryMatch.supplierName} (Débit ${memoryMatch.debitAccount} / Crédit ${memoryMatch.creditAccount}).`,
        entries: [
          {
            debitAccount: memoryMatch.debitAccount,
            creditAccount: memoryMatch.creditAccount,
            amount: amountTTC,
            description: memoryMatch.suggestedDesc || `${docType === "FACTURE_CLIENT" ? "Vente" : "Charge/Achat"} — ${supplier}`,
            reference: refNumber,
          },
        ],
      };
    }

    // Regime Reel with TVA:
    const tvaRate = memoryMatch.tvaRate !== null && memoryMatch.tvaRate !== undefined ? memoryMatch.tvaRate : TVA_RATE;
    const ht = htOverride && htOverride > 0 && htOverride <= amountTTC
      ? Math.round(htOverride * 100) / 100
      : Math.round((amountTTC / (1 + tvaRate)) * 100) / 100;
    const tva = tvaOverride !== undefined && tvaOverride >= 0
      ? Math.round(tvaOverride * 100) / 100
      : Math.round((amountTTC - ht) * 100) / 100;

    const isClientFacture = docType === "FACTURE_CLIENT";
    const entries: EntrySpec[] = isClientFacture
      ? [
          {
            debitAccount: memoryMatch.creditAccount || "411",
            creditAccount: memoryMatch.debitAccount || "700",
            amount: ht,
            description: `Ventes de marchandises / Prestations HT — ${supplier}`,
            reference: refNumber,
          },
          {
            debitAccount: memoryMatch.creditAccount || "411",
            creditAccount: "44571",
            amount: tva,
            description: `TVA collectée (${Math.round(tvaRate * 100)}%) — ${supplier}`,
            reference: refNumber,
          },
        ]
      : [
          {
            debitAccount: memoryMatch.debitAccount,
            creditAccount: memoryMatch.creditAccount,
            amount: ht,
            description: memoryMatch.suggestedDesc || `Achat / Charge HT — ${supplier}`,
            reference: refNumber,
          },
          {
            debitAccount: "44566",
            creditAccount: memoryMatch.creditAccount,
            amount: tva,
            description: `TVA déductible (${Math.round(tvaRate * 100)}%) — ${supplier}`,
            reference: refNumber,
          },
        ];

    return {
      source: "MEMORY",
      memoryMatch,
      explanation: `Appliqué selon la mémoire d'apprentissage du comptable (${memoryMatch.usageCount} validations antérieures).`,
      entries,
    };
  }

  // ── Step 2: Call Gemini AI Accounting Engine ────────────────────────────────
  if (amountTTC > 0) {
    try {
      const aiResult = await generateAccountingWithAi({
        documentType: docType,
        amountTTC,
        amountHT: htOverride,
        amountTVA: tvaOverride,
        supplier,
        refNumber,
        ocrText: rawDesc,
        regimeFiscal,
        subAccounts,
        companyName,
        memoryHint: memoryMatch
          ? {
              debitAccount: memoryMatch.debitAccount,
              creditAccount: memoryMatch.creditAccount,
              tvaRate: memoryMatch.tvaRate,
              isExempt: memoryMatch.isExempt,
            }
          : null,
      });

      if (aiResult && aiResult.entries.length > 0) {
        return {
          source: "AI",
          explanation: aiResult.explanation,
          entries: aiResult.entries,
        };
      }
    } catch (aiErr) {
      console.warn("[SmartEntry] Gemini AI accounting failed, falling back to deterministic generator:", aiErr);
    }
  }

  // ── Step 3: Fallback to Deterministic SCF Algorithm ────────────────────────
  const fallbackEntries = generateEntries(
    docType,
    amountTTC,
    supplier,
    refNumber,
    rawDesc,
    subAccounts,
    htOverride,
    tvaOverride,
    regimeFiscal
  );

  return {
    source: "FALLBACK",
    explanation: "Écriture générée par le moteur standard SCF.",
    entries: fallbackEntries,
  };
}
