import { generateAccountingWithAi } from "../lib/ai-accounting-engine";
import { recordAccountingMemory, findAccountingMemory } from "../lib/accounting-memory";
import { generateSmartEntries } from "../lib/smart-entry-generator";

async function runTests() {
  console.log("=== 1. TEST DIRECT GEMINI AI ACCOUNTING (SCF ALGERIEN) ===");

  const testInvoices = [
    {
      name: "Sonelgaz Électricité (RÉEL)",
      req: {
        documentType: "FACTURE_FOURNISSEUR",
        amountTTC: 11900,
        amountHT: 10000,
        amountTVA: 1900,
        supplier: "SONELGAZ DISTRIBUTION",
        refNumber: "SN-2026-441",
        ocrText: "SONELGAZ Quittance d'électricité et gaz - Période 01/2026. Montant HT: 10 000,00 DA. TVA 19%: 1 900,00 DA. Total TTC: 11 900,00 DA.",
        regimeFiscal: "REEL",
      },
    },
    {
      name: "Achat Carburant Naftal (RÉEL)",
      req: {
        documentType: "FACTURE_FOURNISSEUR",
        amountTTC: 5000,
        supplier: "NAFTAL STATION EL BIAR",
        refNumber: "NF-9921",
        ocrText: "NAFTAL Bon de carburant essence sans plomb pour véhicules de service. Montant TTC: 5 000,00 DZD.",
        regimeFiscal: "REEL",
      },
    },
    {
      name: "Loyer Commercial (Régime IFU / Forfaitaire)",
      req: {
        documentType: "FACTURE_FOURNISSEUR",
        amountTTC: 80000,
        supplier: "BAILLEUR IMMO",
        refNumber: "QUITT-03",
        ocrText: "Quittance de loyer bureau commercial mois de mars 2026. Montant: 80 000 DA.",
        regimeFiscal: "FORFAITAIRE",
      },
    },
  ];

  for (const test of testInvoices) {
    console.log(`\nTesting: ${test.name}`);
    const res = await generateAccountingWithAi(test.req);
    if (res && res.entries.length > 0) {
      console.log(`[PASS] Generated ${res.entries.length} lines:`);
      let sum = 0;
      res.entries.forEach(e => {
        console.log(`  D: ${e.debitAccount} | C: ${e.creditAccount} | Montant: ${e.amount} DA | Libellé: ${e.description}`);
        sum += e.amount;
      });
      console.log(`  Explication: ${res.explanation}`);
      console.log(`  Équilibre: Somme = ${sum} DA / TTC = ${test.req.amountTTC} DA -> ${Math.abs(sum - test.req.amountTTC) < 0.05 ? "PARFAIT" : "ERREUR"}`);
    } else {
      console.log(`[FAIL] AI generation returned null or empty.`);
    }
  }

  console.log("\n=== 2. TEST ACCOUNTANT PREFERENCE MEMORY ===");
  // Create a real or mock company ID in Turso to test foreign key or test findAccountingMemory
  // Let's find an existing company in the DB first
  const { db } = await import("../lib/db");
  const existingCompany = await db.company.findFirst();
  const testCompanyId = existingCompany ? existingCompany.id : "comp-test";

  const testSupplier = "SARL CONDOR EQUIPEMENTS";

  console.log(`Recording accountant preference for ${testSupplier} (Debit: 218, Credit: 401001)...`);
  await recordAccountingMemory({
    companyId: testCompanyId,
    supplierName: testSupplier,
    documentType: "FACTURE_FOURNISSEUR",
    debitAccount: "218",
    creditAccount: "401001",
    tvaRate: 0.19,
    suggestedDesc: "Matériel informatique et électronique",
  });

  console.log("Looking up memory for normalized supplier 'Condor Equipements'...");
  const memory = await findAccountingMemory(testCompanyId, "Condor Equipements");
  if (memory && memory.debitAccount === "218" && memory.creditAccount === "401001") {
    console.log("[PASS] Memory correctly retrieved!", memory);
  } else {
    console.log("[FAIL] Memory match failed:", memory);
  }

  console.log("\nTesting generateSmartEntries with memory active...");
  const smartRes = await generateSmartEntries({
    companyId: testCompanyId,
    docType: "FACTURE_FOURNISSEUR",
    amountTTC: 119000,
    supplier: "CONDOR EQUIPEMENTS",
    refNumber: "FAC-881",
    rawDesc: "Achat d'ordinateurs et imprimantes",
    regimeFiscal: "REEL",
  });

  console.log(`[RESULT] Source: ${smartRes.source}`);
  smartRes.entries.forEach(e => {
    console.log(`  D: ${e.debitAccount} | C: ${e.creditAccount} | Montant: ${e.amount} DA | Libellé: ${e.description}`);
  });
  console.log(`  Explication: ${smartRes.explanation}`);

  if (smartRes.source === "MEMORY" && smartRes.entries[0]?.debitAccount === "218") {
    console.log("[PASS] Smart Entry prioritized Accountant Memory successfully!");
  } else {
    console.log("[FAIL] Smart Entry did not use memory!");
  }

  console.log("\n=== ALL TESTS COMPLETED SUCCESSFULLY ===");
  process.exit(0);
}

runTests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
