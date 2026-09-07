/**
 * Migration: Add payment confirmation workflow fields to PaymentDeclaration
 * Adds: paymentMethod, declaredById, confirmedAt, confirmedById, rejectedAt,
 *       rejectedById, rejectionReason, accountingEntryId
 * Also updates enum values (string-based in SQLite so no ALTER needed)
 */
const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");

function getEnv(key) {
  if (process.env[key]) return process.env[key];
  try {
    const envFile = fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8");
    const match = envFile.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)["']?`, "m"));
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

async function migrate() {
  const url = getEnv("DATABASE_URL") || "libsql://comptanova-db-twiskou.aws-eu-west-1.turso.io";
  const authToken = getEnv("DATABASE_AUTH_TOKEN");

  const client = createClient({ url, authToken });

  console.log("Starting PaymentDeclaration migration...");

  // Check existing columns
  const cols = await client.execute("PRAGMA table_info(PaymentDeclaration)");
  const existing = cols.rows.map((r) => r.name);
  console.log("Existing columns:", existing);

  const toAdd = [
    { name: "paymentMethod",     sql: `ALTER TABLE "PaymentDeclaration" ADD COLUMN "paymentMethod" TEXT DEFAULT 'VIREMENT'` },
    { name: "declaredById",      sql: `ALTER TABLE "PaymentDeclaration" ADD COLUMN "declaredById" TEXT` },
    { name: "confirmedAt",       sql: `ALTER TABLE "PaymentDeclaration" ADD COLUMN "confirmedAt" DATETIME` },
    { name: "confirmedById",     sql: `ALTER TABLE "PaymentDeclaration" ADD COLUMN "confirmedById" TEXT` },
    { name: "rejectedAt",        sql: `ALTER TABLE "PaymentDeclaration" ADD COLUMN "rejectedAt" DATETIME` },
    { name: "rejectedById",      sql: `ALTER TABLE "PaymentDeclaration" ADD COLUMN "rejectedById" TEXT` },
    { name: "rejectionReason",   sql: `ALTER TABLE "PaymentDeclaration" ADD COLUMN "rejectionReason" TEXT` },
    { name: "accountingEntryId", sql: `ALTER TABLE "PaymentDeclaration" ADD COLUMN "accountingEntryId" TEXT` },
  ];

  for (const col of toAdd) {
    if (!existing.includes(col.name)) {
      try {
        await client.execute(col.sql);
        console.log(`✅ Added column: ${col.name}`);
      } catch (e) {
        console.error(`❌ Failed to add ${col.name}:`, e.message);
      }
    } else {
      console.log(`⏭  Column already exists: ${col.name}`);
    }
  }

  // Add UNIQUE index on accountingEntryId (prevents duplicate accounting entries)
  try {
    await client.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS "PaymentDeclaration_accountingEntryId_key" ON "PaymentDeclaration"("accountingEntryId")`
    );
    console.log("✅ UNIQUE index on accountingEntryId created/verified");
  } catch (e) {
    console.log("⏭  Index already exists or error:", e.message);
  }

  // Migrate existing PENDING rows to PENDING_CONFIRMATION
  try {
    const r = await client.execute(
      `UPDATE "PaymentDeclaration" SET "status" = 'PENDING_CONFIRMATION' WHERE "status" = 'PENDING'`
    );
    console.log(`✅ Migrated ${r.rowsAffected} PENDING → PENDING_CONFIRMATION`);
  } catch (e) {
    console.error("❌ Status migration failed:", e.message);
  }

  // Migrate existing REFUSED rows to REJECTED
  try {
    const r = await client.execute(
      `UPDATE "PaymentDeclaration" SET "status" = 'REJECTED', "rejectionReason" = "refusalReason" WHERE "status" = 'REFUSED'`
    );
    console.log(`✅ Migrated ${r.rowsAffected} REFUSED → REJECTED`);
  } catch (e) {
    console.error("❌ REFUSED migration failed:", e.message);
  }

  // Migrate existing VALIDATED rows to CONFIRMED
  try {
    const r = await client.execute(
      `UPDATE "PaymentDeclaration" SET "status" = 'CONFIRMED' WHERE "status" = 'VALIDATED'`
    );
    console.log(`✅ Migrated ${r.rowsAffected} VALIDATED → CONFIRMED`);
  } catch (e) {
    console.error("❌ VALIDATED migration failed:", e.message);
  }

  // Verify
  const final = await client.execute("PRAGMA table_info(PaymentDeclaration)");
  console.log("\nFinal columns:", final.rows.map((r) => r.name));

  const counts = await client.execute(
    `SELECT status, COUNT(*) as n FROM "PaymentDeclaration" GROUP BY status`
  );
  console.log("Status distribution:", counts.rows);

  console.log("\n✅ Migration complete.");
}

migrate().catch(console.error);
