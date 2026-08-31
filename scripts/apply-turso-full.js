const { createClient } = require("@libsql/client");

async function run() {
  const url = process.env.DATABASE_URL || "libsql://comptanova-db-twiskou.aws-eu-west-1.turso.io";
  const authToken = process.env.DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODgxOTU5MjAsImlkIjoiMDE5ZTYxYmYtMTYwMS03M2IyLTliYTItYzVlMTExMjc3YjVkIiwia2lkIjoia3lpcUFXdzQ0TVMwYWhnbGt0aWdwOGZldEk2N3lhWmctRm11YV9tdnU5cyIsInJpZCI6Ijc0YjQ1YTJlLTI0ZTAtNGE0ZC1hM2NhLTFjM2M2YzU4ZTlkZSJ9.URUO5CiBJLKvX1aA9TTWt4PZ4FNUWZqyd7Njs29W_jed33VPy___PdlkWgnWAcC23qSCVgr-hETd0psxLmmiCQ";

  const client = createClient({ url, authToken });

  console.log("Creating new tables...");

  const tables = [
    `CREATE TABLE IF NOT EXISTS "JournalEntryVersion" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "journalEntryId" TEXT NOT NULL,
      "versionNumber" INTEGER NOT NULL,
      "versionType" TEXT NOT NULL,
      "debitAccount" TEXT NOT NULL,
      "creditAccount" TEXT NOT NULL,
      "amount" REAL NOT NULL,
      "description" TEXT NOT NULL,
      "reference" TEXT,
      "createdById" TEXT,
      "actorType" TEXT NOT NULL DEFAULT 'USER',
      "reason" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "JournalEntryVersion_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "JournalEntryVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "ReconciliationMatch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "bankTransactionId" TEXT NOT NULL,
      "journalEntryId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'MATCHED',
      "score" INTEGER,
      "reason" TEXT,
      "matchedById" TEXT,
      "matchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReconciliationMatch_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReconciliationMatch_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReconciliationMatch_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "ComptableInvitation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "code" TEXT,
      "codeHash" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "senderId" TEXT NOT NULL,
      "recipientId" TEXT,
      "companyId" TEXT,
      "targetEmail" TEXT,
      "message" TEXT,
      "expiresAt" DATETIME,
      "acceptedAt" DATETIME,
      "rejectedAt" DATETIME,
      "cancelledAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "ComptableInvitation_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "ComptableInvitation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ComptableInvitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "FiscalRule" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "regimeFiscal" TEXT NOT NULL,
      "taxType" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "form" TEXT,
      "frequency" TEXT NOT NULL,
      "description" TEXT,
      "dueDay" INTEGER,
      "dueMonth" INTEGER,
      "offsetMonths" INTEGER,
      "periodStartDay" INTEGER,
      "periodEndDay" INTEGER,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "version" INTEGER NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "FiscalDeadline" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "fiscalRuleId" TEXT,
      "fiscalYear" INTEGER NOT NULL,
      "period" TEXT,
      "taxType" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "form" TEXT,
      "dueDate" DATETIME NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'UPCOMING',
      "responsibleUserId" TEXT,
      "completedAt" DATETIME,
      "completedById" TEXT,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "FiscalDeadline_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "FiscalDeadline_fiscalRuleId_fkey" FOREIGN KEY ("fiscalRuleId") REFERENCES "FiscalRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "FiscalDeadline_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`
  ];

  for (const t of tables) {
    await client.execute(t);
  }

  // Add missing columns to User if not present
  const userCols = [
    `ALTER TABLE "User" ADD COLUMN "cabinetName" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "agrementNumber" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "wilaya" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "commune" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "adresseCabinet" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "telephoneCabinet" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "emailCabinet" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "specialites" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "specialisation" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "secteurActivite" TEXT`,
    `ALTER TABLE "User" ADD COLUMN "nbCollaborateurs" INTEGER`,
    `ALTER TABLE "User" ADD COLUMN "logoCabinet" TEXT`,
  ];

  for (const col of userCols) {
    try {
      await client.execute(col);
    } catch (e) {
      // Column already added
    }
  }

  // Drop temporary table if leftover
  try {
    await client.execute(`DROP TABLE IF EXISTS "new_User"`);
  } catch (e) {}

  // Create unique index for ComptableInvitation
  try {
    await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "ComptableInvitation_code_key" ON "ComptableInvitation"("code")`);
  } catch (e) {}

  try {
    await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationMatch_bankTransactionId_journalEntryId_key" ON "ReconciliationMatch"("bankTransactionId", "journalEntryId")`);
  } catch (e) {}

  // Verify all tables
  const res = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log("\nALL TABLES IN TURSO:");
  console.log(res.rows.map(r => r.name));
}

run().catch(console.error);
