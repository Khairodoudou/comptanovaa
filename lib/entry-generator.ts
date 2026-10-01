/**
 * Shared accounting entry generator — PCN / SCF Algérien.
 *
 * Multi-entry accounting with TVA (19% standard, 9% reduced, 0% exempt)
 * and full support for Regime Fiscal (REEL vs IFU / Forfaitaire):
 *
 * 1. FACTURE_FOURNISSEUR:
 *    - IFU: Débit 380/6xx (100% TTC) / Crédit 401.x (100% TTC) [Pas de TVA déductible]
 *    - RÉEL: Débit 380/6xx (HT) + Débit 44566 (TVA) / Crédit 401.x (TTC)
 * 2. FACTURE_CLIENT:
 *    - IFU: Débit 411.x (100% TTC) / Crédit 700 (100% TTC) [Pas de TVA collectée]
 *    - RÉEL: Débit 411.x (TTC) / Crédit 700 (HT) + Crédit 44571 (TVA)
 * 3. BON_RECEPTION:
 *    - Débit 30.x (stock) / Crédit 380.x (HT) — entrée en stock
 * 4. BON_LIVRAISON:
 *    - Débit 600 / Crédit 30.x — sortie de stock
 * 5. CHEQUE (émis):
 *    - Débit 401.x / Crédit 512 — règlement fournisseur
 * 6. RELEVE_BANCAIRE:
 *    - Débit 512 / Crédit 401.x
 * 7. CHARGES (SCF):
 *    - 607: Électricité, eau, gaz (Sonelgaz, SEAAL, ADE)
 *    - 602: Fournitures de bureau consommables
 *    - 613: Locations / Loyer commercial
 *    - 615: Entretien et réparations
 *    - 616: Primes d'assurances (SAA, CAAT, CAAR, etc.)
 *    - 622: Rémunérations d'intermédiaires et honoraires (avocat, expert comptable)
 *    - 623: Publicité, relations publiques
 *    - 624: Transports de biens
 *    - 625: Déplacements, missions et réceptions (hôtels, Air Algérie)
 *    - 626: Frais postaux et télécoms (Mobilis, Djezzy, Ooredoo, Algérie Télécom)
 *    - 627: Services bancaires
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

// ─── Helper: detect SCF account for expenses / purchases ───────────────────
export function detectScfAccount(description: string, supplier: string): string {
  const suppLower = (supplier || "").toLowerCase();
  const descLower = (description || "").toLowerCase();

  // Si c'est explicitement un achat commercial de marchandise / stock
  if (/facture\s*d['’]achat|facture\s*achat|bon\s*de\s*commande|achat\s*de\s*marchandise/i.test(descLower)) {
    return "380";
  }

  // 1. Sonelgaz, Eau, Gaz, Électricité -> 607 (Achats non stockés de matières et fournitures)
  // STRICT : Fournisseur Sonelgaz/SEAAL/ADE ou titre explicite de quittance de fluide
  if (
    /sonelgaz|seaal|ade\b|ona\b|alg[eé]rienne des eaux|distribution de l['’]electricite/i.test(suppLower) ||
    /(?:facture|quittance|redevance)\s*(?:de\s*|d['’]\s*)?(?:[eé]lectricit[eé]|gaz\b|eau potable|eau\b)/i.test(descLower) ||
    /consommation\s*(?:d['’][eé]lectricit[eé]|de\s*gaz|d['’]eau)/i.test(descLower)
  ) {
    return "607";
  }

  // 2. Postes & Télécoms (Mobilis, Djezzy, Ooredoo, Algérie Télécom, etc.) -> 626
  // STRICT : Uniquement si le fournisseur est un opérateur télécom / coursier ou facture télécom express.
  // Ne JAMAIS matcher sur le numéro de téléphone ou le site web de contact d'un fournisseur marchand !
  if (
    /mobilis|djezzy|ooredoo|alg[eé]rie t[eé]l[eé]com|algerie telecom|\bat\b|yalidine|ems\b|dhl\b|fedex|chronopost|alg[eé]rie poste/i.test(suppLower) ||
    /(?:facture|quittance|redevance)\s*(?:de\s*|d['’]\s*)?(?:t[eé]l[eé]phone|internet|t[eé]l[eé]com|adsl|fibre)/i.test(descLower) ||
    /redevance(?:s)?\s*t[eé]l[eé]phonique|forfait mobile|envoi colis|colis postal|frais d'affranchissement/i.test(descLower)
  ) {
    return "626";
  }

  // 3. Locations (Loyer, bail, leasing) -> 613
  if (/loyer|location|bail\b|leasing|cr[eé]dit-bail/i.test(descLower) || /location/i.test(suppLower)) {
    return "613";
  }

  // 4. Entretien et réparations -> 615
  if (
    /entretien|r[eé]paration|maintenance|vidange|m[eé]canique|d[eé]pannage/i.test(descLower)
  ) {
    return "615";
  }

  // 5. Primes d'assurances -> 616
  if (
    /assurance|prime d'assurance|saa\b|caat\b|caar\b|ciar\b|cash assurances?|alliance assurances?|axa\b|macir/i.test(suppLower) ||
    /prime d'assurance|police d'assurance/i.test(descLower)
  ) {
    return "616";
  }

  // 6. Rémunérations d'intermédiaires et honoraires -> 622
  if (
    /honoraires?|avocat|notaire|expert.?comptable|commissaire aux comptes|consultant|conseil juridique|audit/i.test(descLower)
  ) {
    return "622";
  }

  // 7. Publicité, publications, relations publiques -> 623
  if (
    /campagne de publicit|annonce publicitaire|sponsoring|r[eé]gie publicitaire|foire|salon d['’]exposition/i.test(descLower)
  ) {
    return "623";
  }

  // 8. Transports de biens -> 624
  if (/frais de transport|fret\b|transport de marchandises|transport maritime|transport a[eé]rien|d[eé]m[eé]nagement/i.test(descLower)) {
    return "624";
  }

  // 9. Déplacements, missions et réceptions -> 625
  if (
    /h[oô]tel|h[eé]bergement|billet d'avion|air alg[eé]rie|tassili|d[eé]placement professionnel/i.test(descLower)
  ) {
    return "625";
  }

  // 10. Fournitures de bureau consommables -> 602
  if (/fournitures? de bureau|papeterie|cartouches? d'encre|toner|rame de papier/i.test(descLower)) {
    return "602";
  }

  // 11. Frais bancaires -> 627
  if (/agios|frais bancaires?|frais de tenue de compte|commission de tenue/i.test(descLower)) {
    return "627";
  }

  // 12. Matières premières -> 381
  if (/mati[eè]res? premi[eè]res?/i.test(descLower)) {
    return "381";
  }

  // Par défaut: 380 (Achats de marchandises stockées)
  return "380";
}

export function isCharge(description: string, supplier: string): boolean {
  const acc = detectScfAccount(description, supplier);
  return acc.startsWith("6");
}

export function chargeAccount(description: string): string {
  return detectScfAccount(description, "");
}

// ─── Helper: detect credit account (401 supplier credit vs 512 bank vs 53 cash) ─
// Only use 512 when there's explicit evidence of a bank transfer or direct debit.
// "chèque" is deliberately excluded: a purchase invoice mentioning "règlement par chèque"
// still credits 401 (the payable), not 512 (the bank) — the cheque settles 401 later.
const BANK_KEYWORDS = /virement|pr[eé]l[eè]vement|d[eé]bit[eé]|d[eé]bit direct|cb|carte bancaire/i;
const CASH_KEYWORDS = /esp[eè]ces?|caisse|liquide|cash|quittance/i;

export function creditForCharge(description: string, defaultCredit: string = "401"): string {
  if (CASH_KEYWORDS.test(description)) return "53";
  if (BANK_KEYWORDS.test(description)) return "512";
  return defaultCredit;
}

export function findSubAccount(
  subAccounts: { parentAccount: string; subAccount: string; name: string }[],
  parent: string,
  label: string
): string {
  const matches = subAccounts.filter((s) => s.parentAccount === parent);
  if (matches.length === 0) return parent;
  const exact = matches.find(
    (s) =>
      s.name.toLowerCase().includes(label.toLowerCase()) ||
      label.toLowerCase().includes(s.name.toLowerCase())
  );
  const candidate = exact ?? matches[0];
  // Safety: never return a charge account (6xx) for stock/purchase accounts (380, 30)
  if ((parent === "380" || parent === "30") && /^6/.test(candidate.subAccount)) {
    return parent;
  }
  return candidate.subAccount;
}

// ─── Main entry generator ─────────────────────────────────────────────────────

/**
 * Generates one or more journal entry specifications for a document.
 * Adheres strictly to Algerian SCF and the company's fiscal regime (REEL vs IFU).
 */
export function generateEntries(
  docType: string,
  amountTTC: number,
  supplier: string,
  refNumber: string | null,
  rawDesc: string = "",
  subAccounts: { parentAccount: string; subAccount: string; name: string }[] = [],
  htOverride?: number,
  tvaOverride?: number,
  regimeFiscal?: string | null
): EntrySpec[] {
  const isIfu = Boolean(
    regimeFiscal &&
      (regimeFiscal.toUpperCase().includes("FORFAIT") ||
        regimeFiscal.toUpperCase().includes("IFU"))
  );

  const lowerText = `${rawDesc} ${supplier}`.toLowerCase();
  let detectedTvaRate = TVA_RATE;
  if (
    lowerText.includes("tva 9%") ||
    lowerText.includes("taux 9%") ||
    (lowerText.includes("9%") && lowerText.includes("tva"))
  ) {
    detectedTvaRate = 0.09;
  } else if (
    lowerText.includes("exonér") ||
    lowerText.includes("exoner") ||
    lowerText.includes("tva 0%") ||
    lowerText.includes("taux 0%") ||
    lowerText.includes("franchise de tva") ||
    lowerText.includes("sans tva")
  ) {
    detectedTvaRate = 0;
  }

  let ht: number;
  let tva: number;

  if (isIfu) {
    // Régime IFU / Forfaitaire: non-assujetti à la TVA. 100% TTC direct en charge ou achat.
    ht = amountTTC;
    tva = 0;
  } else if (tvaOverride !== undefined && tvaOverride >= 0) {
    tva = Math.round(tvaOverride * 100) / 100;
    ht =
      htOverride !== undefined && htOverride > 0
        ? Math.round(htOverride * 100) / 100
        : Math.round((amountTTC - tva) * 100) / 100;
  } else if (htOverride !== undefined && htOverride > 0 && htOverride <= amountTTC) {
    ht = Math.round(htOverride * 100) / 100;
    tva = Math.round((amountTTC - ht) * 100) / 100;
  } else if (detectedTvaRate === 0) {
    ht = amountTTC;
    tva = 0;
  } else {
    ht = Math.round((amountTTC / (1 + detectedTvaRate)) * 100) / 100;
    tva = Math.round((amountTTC - ht) * 100) / 100;
  }

  const label = supplier || "Inconnu";
  const suffix = supplierSuffix(label);

  const acc380 = findSubAccount(subAccounts, "380", label);
  const acc401 = findSubAccount(subAccounts, "401", label);
  const acc411 = findSubAccount(subAccounts, "411", label);
  const acc30 = findSubAccount(subAccounts, "30", label);

  switch (docType) {
    // ── Facture Fournisseur (Achat de marchandise ou Charge d'exploitation) ─
    case "FACTURE_FOURNISSEUR": {
      const detectedAcc = detectScfAccount(rawDesc, supplier);

      const isUtility =
        detectedAcc === "607" &&
        (/sonelgaz|seaal|ade\b|ona\b|alg[eé]rienne des eaux/i.test(supplier) ||
          /(?:facture|quittance|redevance)\s*(?:de\s*|d['’]\s*)?(?:[eé]lectricit[eé]|gaz\b|eau potable|eau\b)/i.test(rawDesc));
      const isTelecom =
        detectedAcc === "626" &&
        (/mobilis|djezzy|ooredoo|alg[eé]rie t[eé]l[eé]com|algerie telecom|\bat\b/i.test(supplier) ||
          /(?:facture|quittance|redevance)\s*(?:de\s*|d['’]\s*)?(?:t[eé]l[eé]phone|internet|t[eé]l[eé]com|adsl|fibre)/i.test(rawDesc));

      if (isUtility) {
        return [
          {
            debitAccount: "607",
            creditAccount: "512",
            amount: amountTTC,
            description: `Achat Non stocké ( électricité, eau) — ${label}`,
            reference: refNumber,
          },
        ];
      }

      if (isTelecom) {
        return [
          {
            debitAccount: "626",
            creditAccount: "512",
            amount: amountTTC,
            description: `Frais postaux et de télécommunications — ${label}`,
            reference: refNumber,
          },
        ];
      }

      const isChargeDoc = detectedAcc.startsWith("6");
      const baseDebitAcc = isChargeDoc
        ? detectedAcc
        : (detectedAcc === "380" ? (acc380 === "380" ? "380.0" : acc380) : findSubAccount(subAccounts, detectedAcc, label));

      // Pour les factures d'achats commerciales, le compte créditeur est 401.0 (ou acc401)
      const creditAcc = isChargeDoc
        ? creditForCharge(rawDesc, acc401 === "401" ? "401.0" : acc401)
        : (acc401 === "401" ? "401.0" : acc401);

      // Si régime IFU ou facture exonérée: enregistrement 100% TTC
      if (isIfu || tva === 0) {
        return [
          {
            debitAccount: baseDebitAcc,
            creditAccount: creditAcc,
            amount: amountTTC,
            description: isIfu
              ? `${isChargeDoc ? "Charge" : "Achat de marchandise"} TTC (Régime IFU) — ${label}`
              : `${isChargeDoc ? "Charge" : "Achat de marchandise"} exonéré TVA — ${label}`,
            reference: refNumber,
          },
        ];
      }

      // Régime Réel standard (Figure 3) : Débit 380.0 (HT) + Débit 44566 (TVA) / Crédit 401.0 (TTC)
      return [
        {
          debitAccount: baseDebitAcc,
          creditAccount: creditAcc,
          amount: ht,
          description: isChargeDoc ? `Charge HT — ${label}` : `Achat de marchandise`,
          reference: refNumber,
        },
        {
          debitAccount: "44566",
          creditAccount: creditAcc,
          amount: tva,
          description: `TVA déductible`,
          reference: refNumber,
        },
      ];
    }

    // ── Facture Client (Vente) ─────────────────────────────────────────────
    // PCN / SCF Algérien: le client est DÉBITEUR (411) ; le produit est CRÉDITEUR (700)
    case "FACTURE_CLIENT": {
      // Si régime IFU ou vente exonérée: 100% TTC au compte 700, pas de 44571
      if (isIfu || tva === 0) {
        return [
          {
            debitAccount: acc411 === "411" ? "411.0" : acc411,
            creditAccount: "700",
            amount: amountTTC,
            description: isIfu
              ? `Vente TTC (Régime IFU) — ${label}`
              : `Vente exonérée TVA — ${label}`,
            reference: refNumber,
          },
        ];
      }

      // Régime Réel standard: Débit 411 (TTC) / Crédit 700 (HT) + Crédit 44571 (TVA collectée)
      const tvaLabel = detectedTvaRate === 0.09 ? "9%" : "19%";
      return [
        {
          debitAccount: acc411 === "411" ? "411.0" : acc411,
          creditAccount: "700",
          amount: ht,
          description: `Vente HT — ${label}`,
          reference: refNumber,
        },
        {
          debitAccount: acc411 === "411" ? "411.0" : acc411,
          creditAccount: "44571",
          amount: tva,
          description: `TVA collectée ${tvaLabel} — ${label}`,
          reference: refNumber,
        },
      ];
    }

    // ── Chèque / Règlement ──────────────────────────────────────────────────
    // a) Chèque reçu / Encaissement client : Débit 512 (Banque) / Crédit 411 (Client)
    // b) Chèque émis / Paiement fournisseur : Débit 401 (Fournisseur) / Crédit 512 (Banque)
    case "CHEQUE": {
      const isClientOrSale = /client|vente|encaiss|recu|re\u00e7u/i.test(label);
      if (isClientOrSale) {
        return [
          {
            debitAccount: "512",
            creditAccount: acc411 === "411" ? "411.0" : acc411,
            amount: amountTTC,
            description: `Encaissement client — ${label}`,
            reference: refNumber,
          },
        ];
      }
      return [
        {
          debitAccount: acc401 === "401" ? "401.0" : acc401,
          creditAccount: "512",
          amount: amountTTC,
          description: `Règlement fournisseur — ${label}`,
          reference: refNumber,
        },
      ];
    }

    // ── Relevé bancaire ────────────────────────────────────────────────────
    case "RELEVE_BANCAIRE":
      return [
        {
          debitAccount: "512",
          creditAccount: acc401 === "401" ? "401.0" : acc401,
          amount: amountTTC,
          description: `Mouvement bancaire — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Bon de réception (Stockage) ────────────────────────────────────────
    case "BON_RECEPTION":
      return [
        {
          debitAccount: acc30,
          creditAccount: acc380 === "380" ? "380.0" : acc380,
          amount: ht,
          description: `Entrée en stock — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Bon de livraison / sortie (Déstockage) ─────────────────────────────
    case "BON_LIVRAISON":
      return [
        {
          debitAccount: "600",
          creditAccount: acc30,
          amount: ht,
          description: `Sortie de stock — ${label}`,
          reference: refNumber,
        },
      ];

    // ── Charges générales / Autre ──────────────────────────────────────────
    default: {
      const detectedAcc = detectScfAccount(rawDesc, supplier);
      const isUtility =
        detectedAcc === "607" &&
        (/sonelgaz|seaal|ade\b|ona\b|alg[eé]rienne des eaux/i.test(supplier) ||
          /(?:facture|quittance|redevance)\s*(?:de\s*|d['’]\s*)?(?:[eé]lectricit[eé]|gaz\b|eau potable|eau\b)/i.test(rawDesc));

      if (isUtility) {
        return [
          {
            debitAccount: "607",
            creditAccount: "512",
            amount: amountTTC,
            description: `Achat Non stocké ( électricité, eau) — ${label}`,
            reference: refNumber,
          },
        ];
      }

      const isTelecom =
        detectedAcc === "626" &&
        (/mobilis|djezzy|ooredoo|alg[eé]rie t[eé]l[eé]com|algerie telecom|\bat\b/i.test(supplier) ||
          /(?:facture|quittance|redevance)\s*(?:de\s*|d['’]\s*)?(?:t[eé]l[eé]phone|internet|t[eé]l[eé]com|adsl|fibre)/i.test(rawDesc));

      if (isTelecom) {
        return [
          {
            debitAccount: "626",
            creditAccount: "512",
            amount: amountTTC,
            description: `Frais postaux et de télécommunications — ${label}`,
            reference: refNumber,
          },
        ];
      }

      const chargeAcc = detectedAcc.startsWith("6") ? detectedAcc : (acc380 === "380" ? "380.0" : acc380);
      const creditTarget = creditForCharge(rawDesc || label, acc401 === "401" ? "401.0" : acc401);
      const creditAcc = creditTarget === "401" ? (acc401 === "401" ? "401.0" : acc401) : creditTarget;

      if (isIfu || tva === 0) {
        return [
          {
            debitAccount: chargeAcc,
            creditAccount: creditAcc,
            amount: amountTTC,
            description: `Charge TTC — ${label}`,
            reference: refNumber,
          },
        ];
      }

      const tvaLabel = detectedTvaRate === 0.09 ? "9%" : "19%";
      return [
        {
          debitAccount: chargeAcc,
          creditAccount: creditAcc,
          amount: ht,
          description: `Charge HT — ${label}`,
          reference: refNumber,
        },
        {
          debitAccount: "44566",
          creditAccount: creditAcc,
          amount: tva,
          description: `TVA déductible ${tvaLabel} — ${label}`,
          reference: refNumber,
        },
      ];
    }
  }
}
