/**
 * GET /api/migrate-db?secret=comptanova2024
 * One-time route to migrate production Turso DB with new tables.
 * DELETE THIS FILE after running!
 */
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const SECRET = "comptanova2024";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];
  const errors: string[] = [];

  async function run(label: string, sql: string) {
    try {
      await db.$executeRawUnsafe(sql);
      results.push(`✅ ${label}`);
    } catch (e: any) {
      // Ignore "already exists" errors
      if (
        e?.message?.includes("already exists") ||
        e?.message?.includes("duplicate column")
      ) {
        results.push(`⏭️ ${label} (already exists — skipped)`);
      } else {
        errors.push(`❌ ${label}: ${e?.message}`);
      }
    }
  }

  // ── Company new columns ──────────────────────────────────────────────────
  await run(
    "Company.bankName",
    `ALTER TABLE "Company" ADD COLUMN "bankName" TEXT`
  );
  await run(
    "Company.beneficiaryName",
    `ALTER TABLE "Company" ADD COLUMN "beneficiaryName" TEXT`
  );
  await run(
    "Company.ccp",
    `ALTER TABLE "Company" ADD COLUMN "ccp" TEXT`
  );
  await run(
    "Company.iban",
    `ALTER TABLE "Company" ADD COLUMN "iban" TEXT`
  );
  await run(
    "Company.rib",
    `ALTER TABLE "Company" ADD COLUMN "rib" TEXT`
  );

  // ── BankTransaction new column ───────────────────────────────────────────
  await run(
    "BankTransaction.importId",
    `ALTER TABLE "BankTransaction" ADD COLUMN "importId" TEXT`
  );
  await run(
    "BankTransaction.reference",
    `ALTER TABLE "BankTransaction" ADD COLUMN "reference" TEXT`
  );
  await run(
    "BankTransaction.senderName",
    `ALTER TABLE "BankTransaction" ADD COLUMN "senderName" TEXT`
  );
  await run(
    "BankTransaction.label",
    `ALTER TABLE "BankTransaction" ADD COLUMN "label" TEXT`
  );
  await run(
    "BankTransaction.balance",
    `ALTER TABLE "BankTransaction" ADD COLUMN "balance" REAL`
  );
  await run(
    "BankTransaction.matchScore",
    `ALTER TABLE "BankTransaction" ADD COLUMN "matchScore" INTEGER`
  );

  // ── SubAccount table ─────────────────────────────────────────────────────
  await run(
    "SubAccount table",
    `CREATE TABLE IF NOT EXISTS "SubAccount" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "parentAccount" TEXT NOT NULL,
      "subAccount" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // ── Invoice table ────────────────────────────────────────────────────────
  await run(
    "Invoice table",
    `CREATE TABLE IF NOT EXISTS "Invoice" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invoiceNumber" TEXT,
      "amount" REAL NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'UNPAID',
      "dueDate" DATETIME,
      "description" TEXT,
      "companyId" TEXT NOT NULL,
      "documentId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // ── PaymentDeclaration table ─────────────────────────────────────────────
  await run(
    "PaymentDeclaration table",
    `CREATE TABLE IF NOT EXISTS "PaymentDeclaration" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invoiceId" TEXT NOT NULL,
      "reference" TEXT,
      "paymentDate" DATETIME,
      "amount" REAL NOT NULL,
      "justificatif" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "refusalReason" TEXT,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // ── InvoicePayment table ─────────────────────────────────────────────────
  await run(
    "InvoicePayment table",
    `CREATE TABLE IF NOT EXISTS "InvoicePayment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invoiceId" TEXT NOT NULL,
      "bankTransactionId" TEXT NOT NULL,
      "declarationId" TEXT,
      "amount" REAL NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // ── BankStatementImport table ────────────────────────────────────────────
  await run(
    "BankStatementImport table",
    `CREATE TABLE IF NOT EXISTS "BankStatementImport" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "filename" TEXT NOT NULL,
      "format" TEXT NOT NULL,
      "rowCount" INTEGER NOT NULL DEFAULT 0,
      "matchedCount" INTEGER NOT NULL DEFAULT 0,
      "companyId" TEXT NOT NULL,
      "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // ── AuditLog table ───────────────────────────────────────────────────────
  await run(
    "AuditLog table",
    `CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "action" TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      "oldValue" TEXT,
      "newValue" TEXT,
      "comment" TEXT,
      "ipAddress" TEXT,
      "companyId" TEXT,
      "userId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // ── Indexes ──────────────────────────────────────────────────────────────
  await run(
    "SubAccount unique index",
    `CREATE UNIQUE INDEX IF NOT EXISTS "SubAccount_subAccount_companyId_key" ON "SubAccount"("subAccount", "companyId")`
  );
  await run(
    "Invoice documentId unique index",
    `CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_documentId_key" ON "Invoice"("documentId")`
  );

  return NextResponse.json({
    status: errors.length === 0 ? "SUCCESS" : "PARTIAL",
    message:
      errors.length === 0
        ? "🎉 Migration réussie ! Supprime /app/api/migrate-db/ maintenant."
        : "Migration partielle — voir les erreurs.",
    results,
    errors,
  });
}
