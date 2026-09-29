import { EntrySpec, generateEntries, TVA_RATE } from "./entry-generator";
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

  // ── Step 1: Check Accountant Preference Memory ──────────────────────────────
  let memoryMatch: AccountingMemoryMatch | null = null;
  try {
    memoryMatch = await findAccountingMemory(companyId, supplier, docType);
  } catch (memErr) {
    console.warn("[SmartEntry] Memory lookup warning:", memErr);
  }

  if (memoryMatch && amountTTC > 0) {
    console.log(`[SmartEntry] Found learned accountant preference for ${supplier}: Débit ${memoryMatch.debitAccount}, Crédit ${memoryMatch.creditAccount}`);

    // If IFU or exempt: 100% TTC direct
    if (isIfu || memoryMatch.isExempt || memoryMatch.tvaRate === 0) {
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
