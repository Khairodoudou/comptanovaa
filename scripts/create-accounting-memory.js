const { createClient } = require("@libsql/client");

async function run() {
  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  const client = createClient({ url, authToken });

  // Cleanup new_User if orphaned
  try {
    await client.execute("DROP TABLE IF EXISTS \"new_User\"");
    console.log("Cleaned up orphaned new_User table if existed.");
  } catch (e) {
    console.warn("new_User drop note:", e.message);
  }

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS "AccountingMemory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "supplierName" TEXT NOT NULL,
      "documentType" TEXT,
      "debitAccount" TEXT NOT NULL,
      "creditAccount" TEXT NOT NULL,
      "tvaRate" REAL,
      "isExempt" BOOLEAN NOT NULL DEFAULT 0,
      "suggestedDesc" TEXT,
      "usageCount" INTEGER NOT NULL DEFAULT 1,
      "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AccountingMemory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `;

  await client.execute(createTableSql);
  console.log("Created AccountingMemory table.");

  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS "AccountingMemory_companyId_supplierName_key" 
    ON "AccountingMemory"("companyId", "supplierName");
  `);
  console.log("Created AccountingMemory unique index.");

  await client.execute(`
    CREATE INDEX IF NOT EXISTS "AccountingMemory_companyId_idx" 
    ON "AccountingMemory"("companyId");
  `);
  console.log("Created AccountingMemory companyId index.");

  const tablesRes = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log("Active tables in Turso:", tablesRes.rows.map(r => r.name));
}

run().catch(console.error);
