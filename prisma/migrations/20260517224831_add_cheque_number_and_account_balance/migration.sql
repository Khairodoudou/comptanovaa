-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN "chequeNumber" TEXT;

-- CreateTable
CREATE TABLE "AccountBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "soldeInitial" REAL NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "setById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountBalance_account_month_year_companyId_key" ON "AccountBalance"("account", "month", "year", "companyId");
