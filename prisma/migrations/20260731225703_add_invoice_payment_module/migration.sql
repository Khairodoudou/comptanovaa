-- AlterTable
ALTER TABLE "Company" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Company" ADD COLUMN "beneficiaryName" TEXT;
ALTER TABLE "Company" ADD COLUMN "ccp" TEXT;
ALTER TABLE "Company" ADD COLUMN "iban" TEXT;
ALTER TABLE "Company" ADD COLUMN "rib" TEXT;

-- CreateTable
CREATE TABLE "SubAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentAccount" TEXT NOT NULL,
    "subAccount" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "dueDate" DATETIME,
    "description" TEXT,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentDeclaration" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentDeclaration_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "declarationId" TEXT,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoicePayment_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvoicePayment_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "PaymentDeclaration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankStatementImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "chequeNumber" TEXT,
    "reference" TEXT,
    "senderName" TEXT,
    "label" TEXT,
    "balance" REAL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "matchScore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "importId" TEXT,
    CONSTRAINT "BankTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankStatementImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BankTransaction" ("amount", "chequeNumber", "companyId", "createdAt", "date", "description", "id", "journalEntryId", "matched") SELECT "amount", "chequeNumber", "companyId", "createdAt", "date", "description", "id", "journalEntryId", "matched" FROM "BankTransaction";
DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";
CREATE UNIQUE INDEX "BankTransaction_journalEntryId_key" ON "BankTransaction"("journalEntryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SubAccount_subAccount_companyId_key" ON "SubAccount"("subAccount", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_documentId_key" ON "Invoice"("documentId");
