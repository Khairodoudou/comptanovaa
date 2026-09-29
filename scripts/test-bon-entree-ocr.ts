import { extractDocumentData } from "../lib/ocr/text-extractor";

const sampleText = `
Bon d'entrée
SARL Nord Pack
15 Rue Mohamed Ben Abdallah Bouira
Algérie.

Fournisseur
SARL Color Print
Adresse : Zone industrielle Oued Semar, Alger

Date d'entrée : 05/09/2026
Bon d'entrée N° : BE-2026-042
Référence facture fournisseur : 03-2026
Nom complet du livreur : Yacine Merabet
NIN du livreur : 71456632 90145 22
Nom du transporteur : Yacine Merabet
NIN du transporteur : 71456632 90145 22

Réf. Produit Description Qté livrée Qté facturée PU HT Total
400223344 Encre noir d'impression 15 litres 15 litres 3 500 DA 52 500 DA
400223345 Encre rouge d'impression 10 litres 10 litres 3 800 DA 38 000 DA
400223346 Encre bleue d'impression 10 litres 10 litres 3 800 DA 38 000 DA
400223347 Encre jaune d'impression 8 litres 8 litres 3 800 DA 30 400 DA
400223348 Vernis d'impression 10 litres 10 litres 4 200 DA 42 000 DA

Réserves Total HT (valeur d'entrée en stock)
200 900 DA

Visa du destinataire
Reçu le : 05/09/2026
`;

const res = extractDocumentData(sampleText, "bon_entree.pdf", {
  name: "SARL Nord Pack",
  raisonSociale: "SARL Nord Pack",
});

console.log("Extracted Data:", JSON.stringify(res, null, 2));
