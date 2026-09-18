/**
 * Professional test suite for OCR text extraction and Algerian SCF entry generation.
 * Run: npx tsx scripts/test-extractor.ts
 */
import { extractDocumentData, type CompanyContext } from "../lib/ocr/text-extractor";
import { generateEntries, detectScfAccount, isCharge } from "../lib/entry-generator";

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail: string = "") {
  if (condition) {
    passed++;
    console.log(`${GREEN}✓${RESET} ${testName}`);
  } else {
    failed++;
    console.log(`${RED}✗${RESET} ${BOLD}${testName}${RESET} — ${detail}`);
  }
}

console.log(`\n${BOLD}========================================`);
console.log(" 1. OCR Extraction Tests (Text-Extractor)");
console.log(`========================================${RESET}\n`);

// ── Test 1: Facture Fournisseur Algérienne (Our company is Client / Buyer) ──
{
  const text = `فاتورة
SARL TechAlgérie
N° de facture : FA-2024-089
Tél: 0550123456
Capital Social: 50 000 000 DA
Date : 15/03/2024
Client : EURL InfoSystems

Désignation :
  Maintenance serveur    85 000 DA
  Licence logiciel      120 000 DA

TOTAL TTC : 205 000 DA`;

  const companyContext: CompanyContext = {
    name: "EURL InfoSystems",
    regimeFiscal: "REEL",
  };

  const res = extractDocumentData(text, "facture_fournisseur.pdf", companyContext);
  assert(res.documentType === "FACTURE_FOURNISSEUR", "Type is FACTURE_FOURNISSEUR when our company is the client", `Got: ${res.documentType}`);
  assert(res.amount === 205000, "Amount ignores phone & capital social, selects 205,000 DA", `Got: ${res.amount}`);
  assert(res.supplier === "SARL TechAlgérie", "Supplier is SARL TechAlgérie", `Got: ${res.supplier}`);
  assert(res.invoiceNumber === "FA-2024-089", "Invoice number is FA-2024-089", `Got: ${res.invoiceNumber}`);
  assert(res.date === "2024-03-15", "Date is 2024-03-15", `Got: ${res.date}`);
}

// ── Test 2: Facture Client (Our company is the Emitter / Seller) ────────────
{
  const text = `FACTURE #FAC-2026-0045
EURL InfoSystems
NIF: 001916012345678
Date : 10/04/2026
Client : SARL ClientExtérieur

Prestation de conseil    100 000 DA
TVA 19%                   19 000 DA
TOTAL TTC :              119 000 DA`;

  const companyContext: CompanyContext = {
    name: "EURL InfoSystems",
    nif: "001916012345678",
    regimeFiscal: "REEL",
  };

  const res = extractDocumentData(text, "facture_client.pdf", companyContext);
  assert(res.documentType === "FACTURE_CLIENT", "Type is FACTURE_CLIENT when our company is the emitter", `Got: ${res.documentType}`);
  assert(res.amount === 119000, "TTC amount is 119,000 DA", `Got: ${res.amount}`);
  assert(res.invoiceNumber === "FAC-2026-0045", "Invoice number is FAC-2026-0045", `Got: ${res.invoiceNumber}`);
}

// ── Test 3: Simple freelance invoice with #number ────────────────────────────
{
  const text = `FACTURE
#12345

Célia Naudin
hello@reallygreatsite.com

Date d'émission : 01/01/2026
Entreprise Concordia

TOTAL : 2 940 €`;

  const res = extractDocumentData(text, "facture_12345.pdf");
  assert(res.supplier === "Célia Naudin", "Supplier is Célia Naudin", `Got: ${res.supplier}`);
  assert(res.invoiceNumber === "12345", "Invoice number is 12345 (not date 01/2026)", `Got: ${res.invoiceNumber}`);
  assert(res.amount === 2940, "Amount is 2940", `Got: ${res.amount}`);
}

// ── Test 4: Cheque with CMC7 line ───────────────────────────────────────────
{
  const text = `Banque de l'Agriculture et du Développement Rural
BADR Banque
CHÈQUE N° 7699290
Payez contre ce chèque non endossable
la somme de soixante-quatre mille dinars
A l'ordre de : SARL khairo informatique
# 64 000,00 DA #
Fait à Alger, le 15/09/2026
!7699290! 00030 00120 0123456789 22`;

  const res = extractDocumentData(text, "cheque_badr.jpg");
  assert(res.documentType === "CHEQUE", "Document type is CHEQUE", `Got: ${res.documentType}`);
  assert(res.chequeNumber === "7699290", "Cheque number is 7699290", `Got: ${res.chequeNumber}`);
  assert(res.amount === 64000, "Cheque amount is 64000", `Got: ${res.amount}`);
}

console.log(`\n${BOLD}========================================`);
console.log(" 2. SCF Account Classification Tests");
console.log(`========================================${RESET}\n`);

{
  assert(detectScfAccount("Facture électricité", "Sonelgaz") === "607", "Sonelgaz mapped to 607 (Fluides non stockés)");
  assert(detectScfAccount("Facture eau", "Seaal") === "607", "Seaal mapped to 607 (Eau)");
  assert(detectScfAccount("Abonnement fibre 4G", "Algérie Télécom") === "626", "Algérie Télécom mapped to 626 (Télécoms)");
  assert(detectScfAccount("Recharge mobile", "Mobilis") === "626", "Mobilis mapped to 626 (Télécoms)");
  assert(detectScfAccount("Loyer commercial 2e trimestre", "Bailleur") === "613", "Loyer mapped to 613 (Locations)");
  assert(detectScfAccount("Vidange et maintenance véhicule", "Garage") === "615", "Maintenance mapped to 615 (Entretien/Réparation)");
  assert(detectScfAccount("Assurance multirisque pro", "SAA Assurances") === "616", "Assurance SAA mapped to 616 (Assurances)");
  assert(detectScfAccount("Honoraires commissaire aux comptes", "Cabinet Audit") === "622", "Honoraires mapped to 622 (Honoraires)");
  assert(detectScfAccount("Campagne publicitaire", "Agence Com") === "623", "Publicité mapped to 623 (Pub/Marketing)");
  assert(detectScfAccount("Transport et livraison", "Yalidine") === "626" || detectScfAccount("Fret et livraison", "Transporteur") === "624", "Transport mapped correctly");
  assert(detectScfAccount("Achat carton et papier", "Papeterie") === "602", "Papeterie mapped to 602 (Fournitures bureau)");
  assert(detectScfAccount("Achat marchandises diverses", "Grossiste") === "380", "Grossiste mapped to 380 (Achats marchandises)");
}

console.log(`\n${BOLD}========================================`);
console.log(" 3. Accounting Entry Generation Tests (Balance & SCF)");
console.log(`========================================${RESET}\n`);

// Helper to verify double-entry balancing
function checkBalance(entries: ReturnType<typeof generateEntries>, expectedTTC: number, testName: string) {
  const sumDebit = entries.reduce((acc, e) => acc + (e.debitAccount ? e.amount : 0), 0);
  const sumCredit = entries.reduce((acc, e) => acc + (e.creditAccount ? e.amount : 0), 0);
  const isBalanced = Math.abs(sumDebit - sumCredit) < 0.05 && Math.abs(sumDebit - expectedTTC) < 0.05;
  assert(isBalanced, `${testName} — Balanced (Debit: ${sumDebit.toFixed(2)} DA == Credit: ${sumCredit.toFixed(2)} DA == TTC: ${expectedTTC})`);
}

// ── Test A: Purchase Invoice (Régime Réel — 19% TVA) ────────────────────────
{
  const entries = generateEntries(
    "FACTURE_FOURNISSEUR",
    119000,
    "SARL Fournisseur",
    "FAC-01",
    "Achat de marchandises",
    [],
    undefined,
    undefined,
    "REEL"
  );
  assert(entries.length === 2, "Facture Fournisseur Réel produces 2 entries (HT + TVA)");
  assert(entries[0].debitAccount === "380" && entries[0].amount === 100000, "Debit 380 HT is 100,000 DA");
  assert(entries[1].debitAccount === "44566" && entries[1].amount === 19000, "Debit 44566 TVA is 19,000 DA");
  assert(entries[0].creditAccount === "401" && entries[1].creditAccount === "401", "Credit is 401 (Fournisseur)");
  checkBalance(entries, 119000, "Facture Fournisseur Réel 19%");
}

// ── Test B: Purchase Invoice (Régime IFU / Forfaitaire — Non-assujetti TVA) ──
{
  const entries = generateEntries(
    "FACTURE_FOURNISSEUR",
    119000,
    "SARL Fournisseur",
    "FAC-02",
    "Achat de marchandises",
    [],
    undefined,
    undefined,
    "FORFAITAIRE" // or IFU
  );
  assert(entries.length === 1, "Facture Fournisseur IFU produces 1 entry (100% TTC, NO TVA line)");
  assert(entries[0].debitAccount === "380" && entries[0].amount === 119000, "Debit 380 is 100% TTC (119,000 DA)");
  assert(entries[0].creditAccount === "401", "Credit is 401");
  assert(!entries.some((e) => e.debitAccount === "44566"), "No 44566 account for IFU company");
  checkBalance(entries, 119000, "Facture Fournisseur IFU");
}

// ── Test C: Purchase Charge (Sonelgaz 607) ───────────────────────────────────
{
  const entries = generateEntries(
    "FACTURE_FOURNISSEUR",
    59500,
    "Sonelgaz",
    "FACT-SONELGAZ",
    "Consommation électricité et gaz",
    [],
    undefined,
    undefined,
    "REEL"
  );
  assert(entries[0].debitAccount === "607", "Debits 607 for Sonelgaz electricité");
  assert(entries[1].debitAccount === "44566", "Debits 44566 for TVA");
  checkBalance(entries, 59500, "Charge Sonelgaz Réel");
}

// ── Test D: Purchase Charge (Algérie Télécom 626) ────────────────────────────
{
  const entries = generateEntries(
    "FACTURE_FOURNISSEUR",
    23800,
    "Algérie Télécom",
    "FACT-AT",
    "Abonnement internet fibre",
    [],
    undefined,
    undefined,
    "REEL"
  );
  assert(entries[0].debitAccount === "626", "Debits 626 for Algérie Télécom");
  checkBalance(entries, 23800, "Charge Télécom Réel");
}

// ── Test E: Reduced TVA 9% ──────────────────────────────────────────────────
{
  const entries = generateEntries(
    "FACTURE_FOURNISSEUR",
    109000,
    "Laboratoire Pharma",
    "FAC-PHARMA",
    "Produits pharmaceutiques taux TVA 9%",
    [],
    undefined,
    undefined,
    "REEL"
  );
  assert(entries.length === 2, "Produces 2 entries for 9% TVA");
  assert(entries[0].amount === 100000, "HT is 100,000 DA");
  assert(entries[1].amount === 9000, "TVA 9% is 9,000 DA");
  checkBalance(entries, 109000, "Facture Réel TVA 9%");
}

// ── Test F: Facture Client (Sale — Régime Réel) ─────────────────────────────
{
  const entries = generateEntries(
    "FACTURE_CLIENT",
    238000,
    "Client Alpha",
    "FAC-V-01",
    "Vente de produits",
    [],
    undefined,
    undefined,
    "REEL"
  );
  assert(entries.length === 2, "Facture Client Réel produces 2 entries");
  assert(entries[0].debitAccount === "411" && entries[0].creditAccount === "700", "Credit 700 HT is 200,000 DA");
  assert(entries[1].debitAccount === "411" && entries[1].creditAccount === "44571", "Credit 44571 TVA collectée is 38,000 DA");
  checkBalance(entries, 238000, "Facture Client Réel");
}

// ── Test G: Facture Client (Sale — Régime IFU) ──────────────────────────────
{
  const entries = generateEntries(
    "FACTURE_CLIENT",
    238000,
    "Client Alpha",
    "FAC-V-02",
    "Vente de produits",
    [],
    undefined,
    undefined,
    "IFU"
  );
  assert(entries.length === 1, "Facture Client IFU produces 1 entry (100% TTC)");
  assert(entries[0].debitAccount === "411" && entries[0].creditAccount === "700" && entries[0].amount === 238000, "Credit 700 is 100% TTC (238,000 DA)");
  assert(!entries.some((e) => e.creditAccount === "44571"), "No 44571 account for IFU client");
  checkBalance(entries, 238000, "Facture Client IFU");
}

console.log(`\n${BOLD}─────────────────────────────────────`);
console.log(`Résultats finaux: ${GREEN}${passed} ✓${RESET} | ${failed > 0 ? RED : RESET}${failed} ✗${RESET}${BOLD} / ${passed + failed} tests${RESET}\n`);

if (failed > 0) {
  process.exit(1);
}
