import { EntrySpec, TVA_RATE } from "./entry-generator";

export interface AiAccountingRequest {
  documentType: string;
  amountTTC: number;
  amountHT?: number;
  amountTVA?: number;
  supplier: string;
  refNumber?: string | null;
  ocrText: string;
  regimeFiscal?: string | null;
  subAccounts?: { parentAccount: string; subAccount: string; name: string }[];
  companyName?: string;
  memoryHint?: {
    debitAccount: string;
    creditAccount: string;
    tvaRate?: number | null;
    isExempt?: boolean;
  } | null;
}

export interface AiAccountingResult {
  entries: EntrySpec[];
  source: "AI" | "MEMORY" | "FALLBACK";
  explanation?: string;
}

const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
];

/**
 * Direct AI accounting entry generator via Gemini with SCF Algérien domain knowledge.
 */
export async function generateAccountingWithAi(
  req: AiAccountingRequest
): Promise<AiAccountingResult | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) {
    console.warn("[AiAccounting] GEMINI_API_KEY is not configured.");
    return null;
  }

  const isIfu = Boolean(
    req.regimeFiscal &&
      (req.regimeFiscal.toUpperCase().includes("FORFAIT") ||
        req.regimeFiscal.toUpperCase().includes("IFU"))
  );

  const subAccountsList = (req.subAccounts || [])
    .map((s) => `${s.subAccount} (${s.name}, parent ${s.parentAccount})`)
    .slice(0, 30)
    .join(", ");

  const prompt = `
Tu es un expert-comptable algérien agréé de haut niveau. Ta mission est de générer la ventilation comptable exacte (écriture de journal) selon le Système Comptable Financier algérien (SCF / PCN) pour le document suivant.

### INFORMATIONS DU DOSSIER :
- Entreprise cliente : "${req.companyName || "Entreprise"}"
- Régime fiscal : "${isIfu ? "RÉGIME FORFAITAIRE / IFU (NON-ASSUJETTI À LA TVA)" : "RÉGIME RÉEL (ASSUJETTI À LA TVA)"}"
- Type de document : "${req.documentType}"
- Tiers (Fournisseur ou Client) : "${req.supplier || "Inconnu"}"
- Référence pièce : "${req.refNumber || "N/A"}"
- Montant Total TTC : ${req.amountTTC} DZD
${req.amountHT ? `- Montant HT extrait : ${req.amountHT} DZD` : ""}
${req.amountTVA ? `- Montant TVA extrait : ${req.amountTVA} DZD` : ""}
${req.memoryHint ? `- PRÉFÉRENCE ANTÉRIEURE DU COMPTABLE : Débit ${req.memoryHint.debitAccount}, Crédit ${req.memoryHint.creditAccount}` : ""}
${subAccountsList ? `- Sous-comptes personnalisés existants : ${subAccountsList}` : ""}

### EXTRAIT TEXTE OCR DE LA FACTURE / PIÈCE :
"""
${(req.ocrText || "").substring(0, 1500)}
"""

### RÈGLES COMPTABLES ALTO-CRITIQUES (SCF ALGÉRIEN) :
1. RÉGIME FORFAITAIRE (IFU) :
   - Si l'entreprise est à l'IFU, IL EST STRICTEMENT INTERDIT de déduire ou collecter la TVA (aucun compte 44566 ou 44571).
   - L'intégralité du montant TTC (${req.amountTTC} DZD) est imputée directement au compte de charge/achat au Débit et Fournisseur 401 au Crédit.
2. RÉGIME RÉEL (Factures fournisseurs) :
   - Décomposer rigoureusement : Montant HT au Débit (Charge 6xx, Stock 38x, ou Immo 21x) + Débit 44566 (TVA déductible 19% ou 9%) / Crédit 401 (Total TTC).
   - Si la facture est exonérée (ou TVA 0%), imputer 100% au Débit sans compte 44566.
   - Si FACTURE_CLIENT : Débit 411 (TTC) / Crédit 700/704 (HT) + Crédit 44571 (TVA collectée).
3. BON DE RÉCEPTION / BON D'ENTRÉE EN STOCK (TRÈS IMPORTANT) :
   - Si le document est un "Bon de réception", "Bon d'entrée", "BR N°", "BE N°", ou contient "entrée en stock" / "valeur d'entrée en stock" :
   - L'écriture est une ENTRÉE EN STOCK : Débit 30 (Stocks de marchandises) ou Débit 32 (Approvisionnements) / Crédit 380 (Achats de marchandises).
   - Le montant est TOUJOURS le montant HT (valeur d'entrée en stock, hors TVA).
   - Il n'y a JAMAIS de compte 401, 44566 ou 44571 dans un bon d'entrée en stock.
   - Exemple : Bon d'entrée 200 900 DA → Débit 30 / 200 900 DA | Crédit 380 / 200 900 DA.
4. BON DE LIVRAISON / BON DE SORTIE DE STOCK :
   - Sortie de stock : Débit 600 (Achats de marchandises vendues) / Crédit 30 (Stocks de marchandises).
   - Le montant est le coût HT de revient des marchandises sorties.
5. CHÈQUE — DEUX CAS OBLIGATOIRES À DISTINGUER (TRÈS IMPORTANT) :
   a) CHÈQUE ÉMIS (Règlement fournisseur) — si "À l'ordre de" est un FOURNISSEUR (pas la société cliente) :
      - L'entreprise PAIE → Débit 401 (Fournisseurs) / Crédit 512 (Banques).
      - Exemple : Chèque BEA N° 456782 à l'ordre de SARL Nord Pack → Débit 401 (SARL Nord Pack) | Crédit 512 (BEA).
   b) CHÈQUE REÇU (Encaissement client) — si "À l'ordre de" est la SOCIÉTÉ CLIENTE elle-même :
      - L'entreprise ENCAISSE → Débit 512 (Banques) / Crédit 411 (Clients).
      - Exemple : Chèque reçu à l'ordre de SARL Café Et Snack → Débit 512 (Banque) | Crédit 411 (Client).
   - Il n'y a JAMAIS de compte TVA (44566 ou 44571) dans une écriture de chèque.
   - Le montant est TOUJOURS le montant TTC inscrit sur le chèque.
6. RELEVÉ BANCAIRE :
   - Entrée de trésorerie : Débit 512 (Banques) / Crédit 401 ou 411.
   - Sortie de trésorerie : Débit 401 / Crédit 512.

   - 607 : Électricité, gaz, eau (Sonelgaz, SEAAL, ADE, etc.)
   - 626 : Postes & Télécoms (Mobilis, Djezzy, Ooredoo, Algérie Télécom, internet, 4G, timbres)
   - 613 : Locations et charges locatives (loyer bureau, dépôt, leasing)
   - 615 : Entretien et réparations (vidange, mécanique, réparations matériel, climatisation)
   - 616 : Primes d'assurances (SAA, CAAT, CIAR, CAAR, etc.)
   - 622 : Honoraires d'intermédiaires (avocat, notaire, comptable, commissaire aux comptes)
   - 623 : Publicité, publications, relations publiques (foires, sponsors, enseignes)
   - 624 : Transports de biens et fret (livraison, transport marchandises)
   - 625 : Déplacements, missions et réceptions (Air Algérie, hôtels, restaurants)
   - 602 : Fournitures de bureau consommables (papeterie, toners, rames de papier)
   - 606 : Achats non stockés (carburant Naftal, lubrifiants, petit outillage)
   - 627 : Services bancaires (commissions, agios)
   - 218 : Matériel informatique ou de bureau durable (> 30 000 DA)
   - 380 : Achats de marchandises stockées (à utiliser uniquement comme Crédit dans un bon de réception/bon d'entrée)
   - 381 : Achats de matières premières
   - 30 : Stocks de marchandises (à utiliser comme Débit dans un bon de réception/bon d'entrée)
8. ÉQUILIBRE OBLIGATOIRE :

   - Chaque ligne d'écriture doit avoir debitAccount, creditAccount, amount (positif), description claire en français avec nom du tiers, et reference.
   - La somme des montants débités DOIT égaler exactement le montant utilisé (HT pour bons de stock, TTC pour factures).

Rends EXCLUSIVEMENT un objet JSON valide suivant ce schéma :
{
  "entries": [
    {
      "debitAccount": "607",
      "creditAccount": "401",
      "amount": 11900,
      "description": "Consommation électricité — Sonelgaz",
      "reference": "FAC-1234"
    }
  ],
  "explanation": "Brève explication professionnelle du choix des comptes SCF"
}
`;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const response = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(18000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        console.warn(`[AiAccounting ${model}] HTTP ${response.status}, trying next model...`);
        continue;
      }

      const data = await response.json();
      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) continue;

      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed.entries) && parsed.entries.length > 0) {
        // Validate balance
        const validEntries: EntrySpec[] = [];
        let totalSum = 0;

        for (const item of parsed.entries) {
          const amt = Number(item.amount);
          if (amt > 0 && item.debitAccount && item.creditAccount) {
            validEntries.push({
              debitAccount: String(item.debitAccount).trim(),
              creditAccount: String(item.creditAccount).trim(),
              amount: Math.round(amt * 100) / 100,
              description: String(item.description || "").trim() || `${req.supplier || "Écriture"}`,
              reference: item.reference || req.refNumber || null,
            });
            totalSum += amt;
          }
        }

        // Check if sum equals TTC within 0.1 DA
        if (validEntries.length > 0) {
          const diff = Math.abs(totalSum - req.amountTTC);
          if (diff > 0.05 && diff < 1.0) {
            // Adjust small rounding diff on the first entry
            validEntries[0].amount = Math.round((validEntries[0].amount + (req.amountTTC - totalSum)) * 100) / 100;
          }

          console.log(`[AiAccounting] Generated ${validEntries.length} entries via ${model}:`, parsed.explanation);
          return {
            entries: validEntries,
            source: "AI",
            explanation: parsed.explanation,
          };
        }
      }
    } catch (err) {
      console.warn(`[AiAccounting ${model}] Error:`, err);
    }
  }

  return null;
}
