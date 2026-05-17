/**
 * Test OCR text extraction with various real invoice formats
 * Run: npx tsx scripts/test-extractor.ts
 */
import { extractDocumentData } from "../lib/ocr/text-extractor";

// ── Test cases ────────────────────────────────────────────────────────────────
const TESTS = [
  {
    name: "Facture FR simple (Célia Naudin style)",
    filename: "facture_12345.pdf",
    text: `FACTURE
#12345

Célia Naudin
hello@reallygreatsite.com

Date d'émission : 01/01/2026
Entreprise Concordia

Description
Création de logo          1 000 €
Carte de visite             300 €
Refonte du site web         900 €
Bannière publicitaire       250 €

Sous total :    2 450 €
TVA (20%) :       490 €
TOTAL :         2 940 €`,
    expected: { date: "2026-01-01", amount: 2940, supplier: "Célia Naudin", invoice: "12345", type: "FACTURE_CLIENT" },
  },
  {
    name: "Facture Algérienne DZD",
    filename: "facture_fournisseur.pdf",
    text: `فاتورة
SARL TechAlgérie
N° de facture : FA-2024-089

Date : 15/03/2024
Client : EURL InfoSystems

Désignation :
  Maintenance serveur    85 000 DA
  Licence logiciel      120 000 DA

TOTAL TTC : 205 000 DA`,
    expected: { date: "2024-03-15", amount: 205000, supplier: "SARL TechAlgérie", invoice: "FA-2024-089", type: "FACTURE_CLIENT" },
  },
  {
    name: "Relevé bancaire",
    filename: "releve_banque_mai.csv",
    text: `Relevé de compte CPA
Période : 01/05/2024 - 31/05/2024
Solde initial : 150 000 DA

Date        Description              Débit       Crédit
05/05/2024  Virement fournisseur     25 000
12/05/2024  Encaissement client                  80 000
Solde final : 205 000 DA`,
    expected: { type: "RELEVE_BANCAIRE" },
  },
  {
    name: "Bon de livraison",
    filename: "bon_livraison_BL-2024-045.pdf",
    text: `BON DE LIVRAISON
BL N° 2024-045

Fournisseur : SPA CommerceAlger
Date : 20/04/2024

Articles livrés :
  - Fournitures bureau x50
  - Cartouche imprimante x10

Montant : 45 500 DA`,
    expected: { date: "2024-04-20", amount: 45500, type: "BON_LIVRAISON" },
  },
  {
    name: "Facture EUR avec milliers (espace)",
    filename: "invoice_EN.pdf",
    text: `INVOICE #INV-2024-001
From: Acme Corp
To: Client ABC

Date: 2024-06-15

Services rendered:
  Consulting   15 000 €
  Development  32 500 €
  
Total: 47 500 €`,
    expected: { date: "2024-06-15", amount: 47500, invoice: "INV-2024-001", type: "FACTURE_CLIENT" },
  },
  {
    name: "Chèque",
    filename: "cheque_paiement.pdf",
    text: `Chèque bancaire
Ordre de paiement
Payer à l'ordre de : SARL Fournisseur
Montant : 35 000 DA
Date : 10/06/2024`,
    expected: { date: "2024-06-10", amount: 35000, type: "CHEQUE" },
  },
  {
    name: "OCR bruité (Tesseract output)",
    filename: "scan_facture.jpg",
    text: `FACTUR E
N0: FA-20 24-0012

Foumisseur: SARL Aig€rTech
Date: 15/O1/2O24

D3signation    Montant
Pr3station      78,OOO DA

T0TAL TTC: 78.000 DA`,
    expected: { type: "FACTURE_CLIENT" }, // données partielles à cause du bruit
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────
const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

let passed = 0;
let failed = 0;

for (const test of TESTS) {
  const result = extractDocumentData(test.text, test.filename);
  const exp = test.expected;

  const checks = {
    date:     exp.date     ? result.date     === exp.date                             : null,
    amount:   exp.amount   ? result.amount   === exp.amount                           : null,
    supplier: exp.supplier ? result.supplier?.toLowerCase().includes(exp.supplier.toLowerCase().split(" ")[0]) : null,
    invoice:  (exp as { invoice?: string }).invoice   ? result.invoiceNumber?.includes((exp as { invoice?: string }).invoice ?? "") : null,
    type:     exp.type     ? result.documentType === exp.type                         : null,
  };

  const allPass = Object.values(checks).every((v) => v !== false);
  if (allPass) passed++; else failed++;

  console.log(`\n${BOLD}${allPass ? GREEN + "✓" : RED + "✗"} ${test.name}${RESET}`);
  console.log(`${DIM}  filename: ${test.filename}${RESET}`);
  console.log(`  ${CYAN}Type:${RESET}     ${result.documentType} ${checks.type === false ? RED + "✗ expected: " + exp.type + RESET : checks.type ? GREEN + "✓" + RESET : DIM + "(not checked)" + RESET}`);
  console.log(`  ${CYAN}Date:${RESET}     ${result.date ?? DIM + "null" + RESET} ${checks.date === false ? RED + "✗ expected: " + exp.date + RESET : checks.date ? GREEN + "✓" + RESET : DIM + "(not checked)" + RESET}`);
  console.log(`  ${CYAN}Montant:${RESET}  ${result.amount ?? DIM + "null" + RESET} ${checks.amount === false ? RED + "✗ expected: " + exp.amount + RESET : checks.amount ? GREEN + "✓" + RESET : DIM + "(not checked)" + RESET}`);
  console.log(`  ${CYAN}Fourn.:${RESET}   ${result.supplier ?? DIM + "null" + RESET} ${checks.supplier === false ? RED + "✗ expected: " + exp.supplier + RESET : checks.supplier ? GREEN + "✓" + RESET : DIM + "(not checked)" + RESET}`);
  console.log(`  ${CYAN}N° Fact:${RESET}  ${result.invoiceNumber ?? DIM + "null" + RESET} ${checks.invoice === false ? RED + "✗ expected: " + (exp as {invoice?:string}).invoice + RESET : checks.invoice ? GREEN + "✓" + RESET : DIM + "(not checked)" + RESET}`);
  console.log(`  ${CYAN}Confid:${RESET}   ${result.confidence}`);
}

console.log(`\n${BOLD}─────────────────────────────────────`);
console.log(`Résultats: ${GREEN}${passed} ✓${RESET} | ${failed > 0 ? RED : RESET}${failed} ✗${RESET}${BOLD} / ${TESTS.length} tests${RESET}\n`);
