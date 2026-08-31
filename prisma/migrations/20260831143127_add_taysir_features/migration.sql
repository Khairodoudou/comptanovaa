-- CreateTable
CREATE TABLE "JournalEntryVersion" (
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
);

-- CreateTable
CREATE TABLE "ReconciliationMatch" (
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
);

-- CreateTable
CREATE TABLE "ComptableInvitation" (
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
);

-- CreateTable
CREATE TABLE "FiscalRule" (
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
);

-- CreateTable
CREATE TABLE "FiscalDeadline" (
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
    "matchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "matchReason" TEXT,
    "matchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "importId" TEXT,
    CONSTRAINT "BankTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankStatementImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BankTransaction" ("amount", "balance", "chequeNumber", "companyId", "createdAt", "date", "description", "id", "importId", "journalEntryId", "label", "matchScore", "matched", "reference", "senderName") SELECT "amount", "balance", "chequeNumber", "companyId", "createdAt", "date", "description", "id", "importId", "journalEntryId", "label", "matchScore", "matched", "reference", "senderName" FROM "BankTransaction";
DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";
CREATE UNIQUE INDEX "BankTransaction_journalEntryId_key" ON "BankTransaction"("journalEntryId");
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "comptableId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "bankName" TEXT,
    "rib" TEXT,
    "iban" TEXT,
    "ccp" TEXT,
    "beneficiaryName" TEXT,
    "raisonSociale" TEXT,
    "formeJuridique" TEXT,
    "nrc" TEXT,
    "nif" TEXT,
    "regimeFiscal" TEXT NOT NULL DEFAULT 'REEL',
    "secteurActivite" TEXT,
    "adresseSiege" TEXT,
    "wilayaEntreprise" TEXT,
    CONSTRAINT "Company_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Company_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Company" ("bankName", "beneficiaryName", "ccp", "clientId", "comptableId", "createdAt", "iban", "id", "name", "rib", "updatedAt") SELECT "bankName", "beneficiaryName", "ccp", "clientId", "comptableId", "createdAt", "iban", "id", "name", "rib", "updatedAt" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AUTRE',
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ocrData" TEXT,
    "companyId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploadedByRole" TEXT,
    "ocrStartedAt" DATETIME,
    "ocrFinishedAt" DATETIME,
    "aiProposedAt" DATETIME,
    "validatedAt" DATETIME,
    "sentToClientAt" DATETIME,
    CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("companyId", "filename", "id", "mimeType", "ocrData", "originalName", "size", "status", "type", "updatedAt", "uploadedAt") SELECT "companyId", "filename", "id", "mimeType", "ocrData", "originalName", "size", "status", "type", "updatedAt", "uploadedAt" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE TABLE "new_JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "debitAccount" TEXT NOT NULL,
    "creditAccount" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "documentId" TEXT,
    "companyId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "journalType" TEXT,
    "validatedById" TEXT,
    "validatedAt" DATETIME,
    "correctedById" TEXT,
    "correctedAt" DATETIME,
    "sentToClient" BOOLEAN NOT NULL DEFAULT false,
    "sentToClientAt" DATETIME,
    "sentToClientById" TEXT,
    CONSTRAINT "JournalEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_sentToClientById_fkey" FOREIGN KEY ("sentToClientById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JournalEntry" ("amount", "comment", "createdAt", "creditAccount", "date", "debitAccount", "description", "documentId", "id", "reference", "status", "updatedAt", "validatedAt", "validatedById") SELECT "amount", "comment", "createdAt", "creditAccount", "date", "debitAccount", "description", "documentId", "id", "reference", "status", "updatedAt", "validatedAt", "validatedById" FROM "JournalEntry";
DROP TABLE "JournalEntry";
ALTER TABLE "new_JournalEntry" RENAME TO "JournalEntry";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "preferredLang" TEXT NOT NULL DEFAULT 'fr',
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cabinetName" TEXT,
    "agrementNumber" TEXT,
    "wilaya" TEXT,
    "commune" TEXT,
    "adresseCabinet" TEXT,
    "specialisation" TEXT,
    "secteurActivite" TEXT,
    "nbCollaborateurs" INTEGER,
    "logoCabinet" TEXT
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "phone", "preferredLang", "role", "updatedAt") SELECT "createdAt", "email", "id", "name", "passwordHash", "phone", "preferredLang", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationMatch_bankTransactionId_journalEntryId_key" ON "ReconciliationMatch"("bankTransactionId", "journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ComptableInvitation_code_key" ON "ComptableInvitation"("code");
