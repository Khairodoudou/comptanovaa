/**
 * scripts/cleanup-corrupted-bank-transactions.ts
 * 
 * Cleans up pre-existing corrupted bank statement transactions:
 * 1. Transactions with absurd amounts (> 999 999 999 DA) caused by IBAN or account number leakage.
 * 2. Transactions with descriptions corrupted by header text ("--- ---", "Titulaire du compte", "Devise DA", "IBAN DZ").
 * 3. Orphaned/corrupted reconciliation matches linked to these transactions.
 * 
 * Usage: npx tsx scripts/cleanup-corrupted-bank-transactions.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPaths = [".env.local", ".env"];
  for (const p of envPaths) {
    const full = path.resolve(process.cwd(), p);
    if (fs.existsSync(full)) {
      const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

const adapter = new PrismaLibSql({
  url,
  ...(authToken ? { authToken } : {}),
});
const db = new PrismaClient({ adapter });

async function cleanup() {
  console.log("============================================================");
  console.log("NETTOYAGE DES TRANSACTIONS BANCAIRES CORROMPUES");
  console.log("============================================================");

  try {
    const allTxs = await db.bankTransaction.findMany({
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        balance: true,
        companyId: true,
        importId: true,
      },
    });

    console.log(`Transactions bancaires totales en base : ${allTxs.length}`);

    const corrupted = allTxs.filter((tx) => {
      // 1. Absurd amount (e.g. IBAN or account number > 999 million DA)
      if (Math.abs(tx.amount) > 999_999_999) return true;
      if (tx.balance !== null && tx.balance !== undefined && Math.abs(tx.balance) > 999_999_999) return true;
      // 2. Header text leakage in description
      if (/--- ---|titulaire du compte|devise da|iban dz|p[eé]riode\s*\/\/–\s*\/\//i.test(tx.description)) return true;
      return false;
    });

    console.log(`Transactions corrompues détectées : ${corrupted.length}`);

    if (corrupted.length === 0) {
      console.log("✅ Aucune transaction corrompue trouvée en base de données.");
      return;
    }

    console.log("\nDétail des transactions à purger :");
    for (const tx of corrupted) {
      console.log(`  - ID: ${tx.id} | Date: ${tx.date.toISOString().slice(0, 10)} | Montant: ${tx.amount} DA | Desc: ${tx.description.slice(0, 50)}...`);
    }

    const corruptedIds = corrupted.map((t) => t.id);

    // 1. Delete associated ReconciliationMatch records
    const matchesDeleted = await db.reconciliationMatch.deleteMany({
      where: {
        bankTransactionId: { in: corruptedIds },
      },
    });
    console.log(`\nReconciliationMatch supprimés : ${matchesDeleted.count}`);

    // 2. Delete associated InvoicePayment records
    const invoicePaymentsDeleted = await db.invoicePayment.deleteMany({
      where: {
        bankTransactionId: { in: corruptedIds },
      },
    });
    console.log(`InvoicePayment supprimés : ${invoicePaymentsDeleted.count}`);

    // 3. Delete the BankTransaction records
    const txDeleted = await db.bankTransaction.deleteMany({
      where: {
        id: { in: corruptedIds },
      },
    });
    console.log(`BankTransaction supprimées : ${txDeleted.count}`);

    // 4. Update rowCount and matchedCount for affected BankStatementImport records
    const affectedImportIds = Array.from(new Set(corrupted.map((t) => t.importId).filter(Boolean))) as string[];
    for (const importId of affectedImportIds) {
      const remainingCount = await db.bankTransaction.count({ where: { importId } });
      const remainingMatched = await db.bankTransaction.count({ where: { importId, matched: true } });
      await db.bankStatementImport.update({
        where: { id: importId },
        data: {
          rowCount: remainingCount,
          matchedCount: remainingMatched,
        },
      });
      console.log(`BankStatementImport ${importId} mis à jour : ${remainingCount} lignes restantes (${remainingMatched} rapprochées).`);
    }

    console.log("\n============================================================");
    console.log(`NETTOYAGE TERMINÉ AVEC SUCCÈS : ${txDeleted.count} transactions purgées`);
    console.log("============================================================");
  } catch (error) {
    console.error("Erreur lors du nettoyage :", error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

cleanup();
