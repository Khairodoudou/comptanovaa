/**
 * Shared accounting entry generator — PCN Algérien.
 *
 * Extracted from /api/documents/upload/route.ts so both the single-upload
 * and batch-upload routes can share the same entry-generation logic.
 *
 * Multi-entry accounting with TVA 19%:
 *   - FACTURE_FOURNISSEUR : Débit 380.x (HT) + Débit 44566 (TVA) / Crédit 401.x (TTC)
 *   - BON_RECEPTION       : Débit 30.x (stock) / Crédit 380.x (HT) — transfert stock
 *   - FACTURE_CLIENT      : Débit 411.x (TTC) / Crédit 700 (HT) + Crédit 44571 (TVA)
 *   - CHEQUE (émis)       : Débit 401.x / Crédit 512 — règlement fournisseur
 *   - RELEVE_BANCAIRE     : Débit 512 / Crédit 401.x
 *   - BON_LIVRAISON       : Débit 600 / Crédit 30.x — sortie de stock au coût d'achat
 *   - AUTRE/Charge        : Débit 607|626 + Débit 44566 / Crédit 401.x|512|53
 */

export const TVA_RATE = 0.19;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EntrySpec {
  debitAccount: string;
  creditAccount: string;
  amount: number;
  description: string;
  reference: string | null;
}

// ─── Helper: derive a short numeric sub-account suffix from supplier name ──
// e.g. "SARL DUPONT" → "001", "Air Algérie" → "002" (deterministic, 3 digits)
export function supplierSuffix(supplier: string): string {
  let hash = 0;
  for (let i = 0; i < supplier.length; i++) {
    hash = (hash * 31 + supplier.charCodeAt(i)) & 0xffffff;
  }
  // Keep in range 1–999 and zero-pad to 3 digits
  const n = (hash % 999) + 1;
  return n.toString().padStart(3, "0");
}

// ─── Helper: detect charge account (607 goods vs 626 services) ─────────────
// 626 = frais postaux, téléphone, publicité, honoraires, transport, internet
// 607 = électricité, eau, gaz (Achats non stockés)
const CHARGE_KEYWORDS =
  /t[eé]l[eé]phone|internet|abonnement|honoraires?|publicit[eé]|transport|poste|courrier|assurance|locat|maint|conseil|formation|nettoyage|gardiennage|[eé]lectricit[eé]|eau|gaz|sonelgaz|seaal|djezzy|mobilis|ooredoo|t[eé]l[eé]com/i;

export function isCharge(description: string, supplier: string): boolean {
  return CHARGE_KEYWORDS.test(description) || CHARGE_KEYWORDS.test(supplier);
}

export function chargeAccount(description: string): "607" | "626" {
  // Electricité / Eau are usually 607 (Achat non stocké), telecom is 626
  if (/[eé]lectricit[eé]|eau|gaz|sonelgaz|seaal/i.test(description)) return "607";
  return "626";
}

// ─── Helper: detect credit account (401 supplier credit vs 512 bank vs 53 cash) ─
// If description mentions virement / prélèvement / banque → 512
// If it mentions espèces / caisse / liquide → 53
// Default: 401 (supplier credit — paid later)
const BANK_KEYWORDS = /virement|pr[eé]l[eè]vement|banque|CB|carte/i;
const CASH_KEYWORDS = /esp[eè]ces?|caisse|liquide|cash/i;

export function creditForCharge(description: string): "401" | "512" | "53" {
  if (CASH_KEYWORDS.test(description)) return "53";
  // Default: 512 (Banque) — charges are almost always paid by bank transfer or cheque
  // Only use 401 if description explicitly mentions "crédit", "terme", "facture à payer"
  if (/cr[eé]dit|terme|facture.{0,20}pay|débit[eé]|pr[eé]l[eè]v/i.test(description)) return "401";
  return "512";
}

export function findSubAccount(
  subAccounts: { parentAccount: string; subAccount: string; name: string }[],
  parent: string,
  label: string
): string {
  const matches = subAccounts.filter(s => s.parentAccount === parent);
  if (matches.length === 0) return `${parent}.0`;
  const exact = matches.find(
    s =>
      s.name.toLowerCase().includes(label.toLowerCase()) ||
      label.toLowerCase().includes(s.name.toLowerCase())
  );
  const candidate = exact ?? matches[0];
  // Safety: never return a charge account (6xx) for stock/purchase accounts (380, 30)
  // This prevents mis-configured sub-accounts from corrupting journal entries
  if ((parent === "380" || parent === "30") && /^6/.test(candidate.subAccount)) {
    return `${parent}.0`;
  }
  return candidate.subAccount;
}

// ─── Main entry generator ─────────────────────────────────────────────────────

/**
 * Generates one or more journal entry specifications for a document.
 */
export function generateEntries(
  docType: string,
  amountTTC: number,
  supplier: string,
  refNumber: string | null,
  rawDesc: string = "",
  subAccounts: { parentAccount: string; subAccount: string; name: string }[] = [],
  htOverride?: number,
  tvaOverride?: number
): EntrySpec[] {
  // Use OCR-extracted HT/TVA if provided; otherwise compute from TTC
  const ht  = htOverride  ?? Math.round((amountTTC / (1 + TVA_RATE)) * 100) / 100;
  const tva = tvaOverride ?? Math.round((amountTTC - ht) * 100) / 100;

  const label  = supplier || "Inconnu";
  const suffix = supplierSuffix(label);
  
  const acc380 = findSubAccount(subAccounts, "380", label);
  const acc401 = findSubAccount(subAccounts, "401", label);
  const acc411 = findSubAccount(subAccounts, "411", label);
  const acc30  = findSubAccount(subAccounts, "30", label);

  switch (docType) {
    // ── Achat marchandises (Facturation seule) ─────────────────────────────
    case "FACTURE_FOURNISSEUR":
      // ── Les charges (override pour factures d'électricité, eau, téléphone) ──
      if (isCharge(rawDesc, supplier)) {
        const chargeAcc = chargeAccount(rawDesc || label);
        const creditAcc = creditForCharge(rawDesc || label);
        const credit = creditAcc === "401" ? acc401 : creditAcc;
        return [
          {
            debitAccount:  chargeAcc,
            creditAccount: credit,
            amount: amountTTC,
            description: `Charge TTC — ${label}`,
            reference: refNumber,
          }
        ];
      }

      // Safety: if acc380 resolved to a 6xx charge account (plan comptable misconfigured),
      // treat as a charge entry to avoid generating a wrong 44566 TVA entry
      if (/^6/.test(acc380)) {
        const credit = creditForCharge(rawDesc || label);
        const creditAcc = credit === "401" ? acc401 : credit;
        return [
          {
            debitAccount:  acc380,
            creditAccount: creditAcc,
            amount: amountTTC,
            description: `Charge TTC — ${label}`,
            reference: refNumber,
          }
        ];
      }

      // ── Achat normal (avec TVA) ──
      return [
        {
          debitAccount:  acc380,
          creditAccount: acc401,
          amount: ht,
          description: `Achat marchandises HT — ${label}`,
          reference: refNumber,
        },
        {
          debitAccount:  "44566",
          creditAccount: acc401,
          amount: tva,
          description: `TVA déductible 19% — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Vente (Facturation seule) ──────────────────────────────────────────
    // PCN Algérien: le client est DÉBITEUR (411) ; le produit est CRÉDITEUR (700)
    case "FACTURE_CLIENT":
      return [
        {
          debitAccount:  acc411,   // 411.x — Client (créance à recouvrer)
          creditAccount: "700",    // 700   — Ventes de marchandises
          amount: ht,
          description: `Vente HT — ${label}`,
          reference: refNumber,
        },
        {
          debitAccount:  acc411,   // 411.x — Client (TTC = HT + TVA collectée)
          creditAccount: "44571",  // 44571 — TVA collectée
          amount: tva,
          description: `TVA collectée 19% — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Chèque émis / Paiement fournisseur ────────────────────────────────────
    // PCN Algérien: le chèque émis règle le fournisseur (401 débiteur) via banque (512 créditeur)
    case "CHEQUE":
      return [
        {
          debitAccount:  acc401,  // 401.x — Fournisseur (soldé)
          creditAccount: "512",   // 512   — Banque (sortie de trésorerie)
          amount: amountTTC,
          description: `Règlement chèque fournisseur — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Relevé bancaire ────────────────────────────────────────────────────
    case "RELEVE_BANCAIRE":
      return [
        {
          debitAccount:  "512",
          creditAccount: acc401,
          amount: amountTTC,
          description: `Mouvement bancaire — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Bon de réception (Stockage) ────────────────────────────────────────
    case "BON_RECEPTION":
      return [
        {
          debitAccount:  acc30,
          creditAccount: acc380,
          amount: ht, // Le stockage se fait toujours au coût d'achat HT
          description: `Entrée en stock — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Bon de livraison / sortie (Déstockage) ─────────────────────────────
    case "BON_LIVRAISON":
      return [
        {
          debitAccount:  "600",
          creditAccount: acc30,
          amount: ht, // Le déstockage se fait au coût d'achat HT
          description: `Sortie de stock — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Charges générales / Autre ──────────────────────────────────────────
    // Fix 3.3: auto-detect 607 vs 626; auto-detect 401 / 512 / 531
    default: {
      const chargeAcc = chargeAccount(rawDesc || label);
      const creditAcc = creditForCharge(rawDesc || label);
      const credit    = creditAcc === "401" ? `401.${suffix}` : creditAcc;
      return [
        {
          debitAccount:  chargeAcc,
          creditAccount: credit,
          amount: ht,
          description: `Charge HT — ${label}`,
          reference: refNumber,
        },
        {
          debitAccount:  "44566",
          creditAccount: credit,
          amount: tva,
          description: `TVA déductible 19% — ${label}`,
          reference: refNumber,
        },
      ];
    }
  }
}
