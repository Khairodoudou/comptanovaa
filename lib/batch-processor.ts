import { runOcr } from "@/lib/ocr/professional-ocr";
import { extractDocumentData, ExtractedData } from "@/lib/ocr/text-extractor";
import { generateEntries, EntrySpec } from "@/lib/entry-generator";

export interface BatchInput {
  documents: Array<{
    filename: string;
    buffer: Buffer;
    mimeType: string;
  }>;
  companyId: string;
  companyName: string;
  subAccounts: Array<{ parentAccount: string; subAccount: string; name: string }>;
}

export type BatchErrorCode =
  | "TWO_INVOICES"      // 2 factures uploadées
  | "TWO_CHEQUES"       // 2 chèques uploadés
  | "UNKNOWN_DOCUMENT"  // 1 document non identifié
  | "AMBIGUOUS_TYPE"    // type de facture indéterminable
  | "OCR_FAILURE";      // échec OCR sur un des fichiers

export interface BatchError {
  erreur: true;
  code: BatchErrorCode;
  message: string;
}

export interface BatchResult {
  documents_detectes: Array<{
    nom_fichier: string;
    type: "facture" | "cheque";
    sous_type: "vente" | "achat" | null;
  }>;
  scenario_applique: "1" | "2";
  ecritures_cheque: Array<{
    compte: string;
    sens: "debit" | "credit";
    montant: number;
    libelle: string;
  }>;
  ecritures_facture: EntrySpec[];
  facture_modifiee: boolean;
  message: string;
  // Included to pass extracted data back for persistence
  facture_data: ExtractedData;
  cheque_data: ExtractedData;
  ocr_results: Array<{ rawText: string; confidence: number; method: string; processingMs: number; needsManualReview: boolean }>;
}

export type BatchResponse = BatchResult | BatchError;

export async function processBatch(input: BatchInput): Promise<BatchResponse> {
  // Étape 1 — OCR des 2 documents
  const ocrResults = await Promise.all(
    input.documents.map(async (doc) => {
      try {
        const res = await runOcr(doc.buffer, doc.filename, doc.mimeType, input.companyName);
        return res;
      } catch (e: any) {
        throw new Error(`OCR_FAILED: ${e.message}`);
      }
    })
  ).catch(() => null);

  if (!ocrResults) {
    return {
      erreur: true,
      code: "OCR_FAILURE",
      message: "L'analyse OCR a échoué sur l'un des documents."
    };
  }

  // Étape 2 — Classification de chaque document
  const classified = ocrResults.map((ocr, i) => ({
    filename: input.documents[i].filename,
    data: ocr.extracted,
    ocrData: {
      rawText: ocr.rawText,
      confidence: ocr.tesseractConfidence,
      method: ocr.method,
      processingMs: ocr.processingMs,
      needsManualReview: ocr.needsManualReview,
    }
  }));

  // Étape 3 — Tri explicite : identifier lequel est le chèque, lequel est la facture
  const chequeDoc = classified.find(d => d.data.documentType === 'CHEQUE');
  const factureDoc = classified.find(d =>
    d.data.documentType === 'FACTURE_CLIENT' ||
    d.data.documentType === 'FACTURE_FOURNISSEUR' ||
    d.data.documentType === 'AUTRE' // Si pas explicitement facture mais pas cheque, on vérifie si c'est une facture valide plus tard
  );

  // Étape 4 — Vérification de la combinaison
  if (!chequeDoc && !factureDoc) {
    return { erreur: true, code: "UNKNOWN_DOCUMENT", message: "Aucun des 2 documents n'a pu être identifié. Vérifiez la qualité des PDFs." };
  }
  if (!chequeDoc) {
    return { erreur: true, code: "TWO_INVOICES", message: "Les 2 documents semblent être des factures. Uploadez 1 facture et 1 chèque." };
  }
  if (!factureDoc || factureDoc.data.documentType === 'CHEQUE') {
    return { erreur: true, code: "TWO_CHEQUES", message: "Les 2 documents semblent être des chèques. Uploadez 1 facture et 1 chèque." };
  }

  // Étape 5 — Détermination du type de facture avec vérification croisée
  let factureType: "vente" | "achat" | "ambiguous";

  if (factureDoc.data.documentType === 'FACTURE_CLIENT') {
    factureType = "vente";
  } else if (factureDoc.data.documentType === 'FACTURE_FOURNISSEUR') {
    factureType = "achat";
  } else {
    // Vérification croisée : comparer companyName avec supplier (l'émetteur extrait du PDF)
    // text-extractor extrait un champ 'supplier'
    const supplier = (factureDoc.data.supplier ?? "").toLowerCase();
    const company = input.companyName.toLowerCase();

    // In Comptanova text-extractor, 'supplier' is often the other party.
    // However, if the 'supplier' matches our company name, then we are the issuer -> VENTE.
    // If it doesn't match our company name, and it is a generic extraction, it might be the vendor -> ACHAT.
    const matchCompany = supplier.includes(company) || company.includes(supplier) && supplier.length > 3;

    if (matchCompany) {
      factureType = "vente"; // notre entreprise est l'émetteur → elle vend
    } else if (supplier && supplier.length > 0) {
      factureType = "achat"; // notre entreprise est le destinataire → elle achète
    } else {
      factureType = "ambiguous";
    }
  }

  if (factureType === "ambiguous") {
    return {
      erreur: true,
      code: "AMBIGUOUS_TYPE",
      message: "Impossible de déterminer si la facture est une vente ou un achat. Précisez le type manuellement.",
    };
  }

  // Étape 6 — Génération des écritures du chèque selon le scénario
  const montantCheque = chequeDoc.data.amount ?? factureDoc.data.amount ?? 0;
  const tiers = factureDoc.data.supplier ?? "Inconnu";
  const numeroCheque = chequeDoc.data.chequeNumber ?? "???";

  const ecritures_cheque = factureType === "vente"
    ? [
        { compte: "512", sens: "debit" as const,  montant: montantCheque, libelle: `Règlement chèque n°${numeroCheque} — ${tiers}` },
        { compte: "411", sens: "credit" as const, montant: montantCheque, libelle: `Règlement chèque n°${numeroCheque} — ${tiers}` },
      ]
    : [
        { compte: "401", sens: "debit" as const,  montant: montantCheque, libelle: `Règlement chèque n°${numeroCheque} — ${tiers}` },
        { compte: "512", sens: "credit" as const, montant: montantCheque, libelle: `Règlement chèque n°${numeroCheque} — ${tiers}` },
      ];

  // Étape 7 — Écritures de la facture via le générateur existant
  const docTypeToUse = factureType === "vente" ? "FACTURE_CLIENT" : "FACTURE_FOURNISSEUR";
  
  const amountTTC = factureDoc.data.amount ?? 0;
  const supplierFacture = factureDoc.data.supplier ?? "Inconnu";
  const refNumberFacture = factureDoc.data.invoiceNumber ?? null;
  const rawDescFacture = factureDoc.ocrData.rawText;
  
  // Use extracted HT/TVA from the invoice
  const computedHT  = Math.round((amountTTC / 1.19) * 100) / 100;
  const computedTVA = Math.round((amountTTC - computedHT) * 100) / 100;
  const htForEntries  = factureDoc.data.amountHT  ?? computedHT;
  const tvaForEntries = factureDoc.data.amountTVA ?? computedTVA;

  const ecritures_facture = generateEntries(
    docTypeToUse,
    amountTTC,
    supplierFacture,
    refNumberFacture,
    rawDescFacture,
    input.subAccounts,
    htForEntries,
    tvaForEntries
  );

  return {
    documents_detectes: [
      { nom_fichier: chequeDoc.filename,  type: "cheque",  sous_type: null },
      { nom_fichier: factureDoc.filename, type: "facture", sous_type: factureType },
    ],
    scenario_applique: factureType === "vente" ? "1" : "2",
    ecritures_cheque,
    ecritures_facture,
    facture_modifiee: false,
    message: factureType === "vente"
      ? "Scénario 1 appliqué : facture de vente + chèque. 512 D / 411 C."
      : "Scénario 2 appliqué : facture d'achat + chèque. 401 D / 512 C.",
    facture_data: factureDoc.data,
    cheque_data: chequeDoc.data,
    ocr_results: [chequeDoc.ocrData, factureDoc.ocrData],
  };
}
