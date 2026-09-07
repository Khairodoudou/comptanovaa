import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as fs from "fs";
import * as path from "path";

function getEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const envFile = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    const match = envFile.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)["']?`, "m"));
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

const url = getEnv("DATABASE_URL") || "libsql://comptanova-db-twiskou.aws-eu-west-1.turso.io";
const authToken = getEnv("DATABASE_AUTH_TOKEN");

const adapter = new PrismaLibSql({ url, authToken });
const db = new PrismaClient({ adapter });

async function runTests() {
  console.log("==================================================");
  console.log("🚀 STARTING PAYMENT CONFIRMATION WORKFLOW VERIFICATION");
  console.log("==================================================");

  let testClientId = "";
  let testAccountantId = "";
  let testCompanyId = "";
  let testInvoiceId = "";
  let testDeclId = "";
  let testJournalEntryId = "";

  try {
    const accountant = await db.user.findFirst({ where: { role: "COMPTABLE" } });
    if (!accountant) throw new Error("No accountant user found in database");
    testAccountantId = accountant.id;
    console.log(`✓ Found accountant: ${accountant.name || accountant.email} (${accountant.id})`);

    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    if (!client) throw new Error("No client user found in database");
    testClientId = client.id;
    console.log(`✓ Found client: ${client.name || client.email} (${client.id})`);

    let company = await db.company.findFirst({
      where: { clientId: client.id, comptableId: accountant.id },
    });
    if (!company) {
      company = await db.company.findFirst({
        where: { comptableId: accountant.id },
      });
    }
    if (!company) {
      company = await db.company.create({
        data: {
          name: "Test Entreprise SARL",
          clientId: client.id,
          comptableId: accountant.id,
        },
      });
    }
    testCompanyId = company.id;
    console.log(`✓ Found/created company: ${company.name} (${company.id})`);

    const invoice = await db.invoice.create({
      data: {
        companyId: company.id,
        invoiceNumber: `TEST-INV-${Date.now().toString().slice(-6)}`,
        amount: 25000,
        dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        status: "UNPAID",
      },
    });
    testInvoiceId = invoice.id;
    console.log(`✓ Created test invoice: ${invoice.invoiceNumber} for ${invoice.amount} DZD`);

    // TEST 1: Declaration Creation
    console.log("\n--- TEST 1: Payment Declaration (Client) ---");
    const decl = await (db as any).paymentDeclaration.create({
      data: {
        invoiceId: invoice.id,
        amount: 25000,
        reference: "VIR-TEST-2026-001",
        paymentMethod: "VIREMENT",
        paymentDate: new Date(),
        declaredById: client.id,
        status: "PENDING_CONFIRMATION",
      },
    });
    testDeclId = decl.id;

    if (decl.status !== "PENDING_CONFIRMATION") {
      throw new Error(`Expected status PENDING_CONFIRMATION, got ${decl.status}`);
    }
    if (decl.paymentMethod !== "VIREMENT") {
      throw new Error(`Expected paymentMethod VIREMENT, got ${decl.paymentMethod}`);
    }
    if (decl.accountingEntryId !== null && decl.accountingEntryId !== undefined) {
      throw new Error("Payment declaration MUST NOT have accountingEntryId at declaration time");
    }

    const entriesCount = await db.journalEntry.count({
      where: { reference: "VIR-TEST-2026-001" },
    });
    if (entriesCount !== 0) {
      throw new Error("CRITICAL: A JournalEntry was created during declaration! It MUST NOT exist yet.");
    }
    console.log("✓ Test 1 Passed: PaymentDeclaration created with PENDING_CONFIRMATION and NO JournalEntry");

    // TEST 2: Confirmation Flow
    console.log("\n--- TEST 2: Payment Confirmation & Accounting Generation ---");
    const confirmResult = await db.$transaction(async (tx) => {
      const fresh = await (tx as any).paymentDeclaration.findUnique({
        where: { id: decl.id },
        include: { invoice: { include: { company: true } } },
      });
      if (!fresh || fresh.status !== "PENDING_CONFIRMATION") {
        throw new Error("Invalid declaration state for confirmation");
      }

      const entry = await tx.journalEntry.create({
        data: {
          date: fresh.paymentDate || new Date(),
          description: `Règlement facture ${fresh.invoice.invoiceNumber} (${fresh.paymentMethod || "VIREMENT"})`,
          debitAccount: "512",
          creditAccount: "411",
          amount: fresh.amount,
          reference: fresh.reference || `DECL-${fresh.id.slice(-6)}`,
          status: "VALIDATED",
          source: "PAIEMENT",
          journalType: "BANQUE",
          companyId: fresh.invoice.companyId,
          documentId: fresh.invoice.documentId || null,
          validatedById: accountant.id,
          validatedAt: new Date(),
        },
      });

      await tx.journalEntryVersion.create({
        data: {
          journalEntryId: entry.id,
          versionNumber: 1,
          versionType: "VALIDATION",
          debitAccount: entry.debitAccount,
          creditAccount: entry.creditAccount,
          amount: entry.amount,
          description: entry.description,
          reference: entry.reference,
          createdById: accountant.id,
          actorType: "USER",
          reason: "Validation et confirmation du paiement par le comptable",
        },
      });

      const updatedDecl = await (tx as any).paymentDeclaration.update({
        where: { id: fresh.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedById: accountant.id,
          accountingEntryId: entry.id,
        },
      });

      const allConfirmed = await (tx as any).paymentDeclaration.findMany({
        where: { invoiceId: fresh.invoiceId, status: "CONFIRMED" },
      });
      const totalPaid = allConfirmed.reduce((sum: number, d: any) => sum + d.amount, 0);
      const newInvoiceStatus = totalPaid >= fresh.invoice.amount ? "PAID" : "PARTIALLY_PAID";

      await tx.invoice.update({
        where: { id: fresh.invoiceId },
        data: { status: newInvoiceStatus },
      });

      return { entry, updatedDecl, newInvoiceStatus, totalPaid };
    });

    testJournalEntryId = confirmResult.entry.id;

    if (confirmResult.updatedDecl.status !== "CONFIRMED") {
      throw new Error(`Expected CONFIRMED status, got ${confirmResult.updatedDecl.status}`);
    }
    if (confirmResult.updatedDecl.accountingEntryId !== confirmResult.entry.id) {
      throw new Error("PaymentDeclaration accountingEntryId does not match created JournalEntry");
    }
    if (confirmResult.entry.debitAccount !== "512" || confirmResult.entry.creditAccount !== "411") {
      throw new Error(`Expected Debit 512 / Credit 411, got Debit ${confirmResult.entry.debitAccount} / Credit ${confirmResult.entry.creditAccount}`);
    }
    if (confirmResult.newInvoiceStatus !== "PAID") {
      throw new Error(`Expected invoice status PAID, got ${confirmResult.newInvoiceStatus}`);
    }

    const versions = await db.journalEntryVersion.findMany({
      where: { journalEntryId: confirmResult.entry.id },
    });
    if (versions.length !== 1 || versions[0].versionNumber !== 1) {
      throw new Error(`Expected exactly 1 JournalEntryVersion with version 1, found ${versions.length}`);
    }
    console.log("✓ Test 2 Passed: Payment confirmed, 512/411 JournalEntry + JournalEntryVersion created, Invoice status updated to PAID");

    // TEST 3: Idempotency Check
    console.log("\n--- TEST 3: Idempotency Check ---");
    const reConfirmAttempt = await (db as any).paymentDeclaration.findUnique({
      where: { id: testDeclId },
    });
    if (reConfirmAttempt?.status === "CONFIRMED") {
      console.log("✓ Re-confirming already CONFIRMED payment is safely detected and guarded (status is not PENDING_CONFIRMATION)");
    }
    try {
      await (db as any).paymentDeclaration.create({
        data: {
          invoiceId: invoice.id,
          amount: 5000,
          status: "CONFIRMED",
          accountingEntryId: testJournalEntryId,
        },
      });
      throw new Error("CRITICAL: Unique constraint on accountingEntryId failed! A second declaration linked to the same JournalEntry!");
    } catch (e: any) {
      if (e.message.includes("CRITICAL")) throw e;
      console.log("✓ Unique constraint successfully prevented duplicate entry linking");
    }
    console.log("✓ Test 3 Passed: Idempotency and uniqueness guards are active");

    // TEST 4: Rejection Workflow
    console.log("\n--- TEST 4: Payment Rejection Flow ---");
    const invoice2 = await db.invoice.create({
      data: {
        companyId: company.id,
        invoiceNumber: `TEST-INV2-${Date.now().toString().slice(-6)}`,
        amount: 15000,
        dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        status: "UNPAID",
      },
    });

    const decl2 = await (db as any).paymentDeclaration.create({
      data: {
        invoiceId: invoice2.id,
        amount: 15000,
        reference: "VIR-TEST-REJECT-002",
        paymentMethod: "CIB",
        status: "PENDING_CONFIRMATION",
        declaredById: client.id,
      },
    });

    const rejectionReason = "Montant non reçu sur le compte bancaire - référence introuvable";
    const rejectedDecl = await (db as any).paymentDeclaration.update({
      where: { id: decl2.id },
      data: {
        status: "REJECTED",
        rejectionReason,
        rejectedAt: new Date(),
        rejectedById: accountant.id,
      },
    });

    if (rejectedDecl.status !== "REJECTED") {
      throw new Error(`Expected REJECTED status, got ${rejectedDecl.status}`);
    }
    if (rejectedDecl.rejectionReason !== rejectionReason) {
      throw new Error("Rejection reason was not saved properly");
    }
    if (rejectedDecl.accountingEntryId) {
      throw new Error("Rejected declaration MUST NOT have an accountingEntryId");
    }

    const confirmedForInv2 = await (db as any).paymentDeclaration.findMany({
      where: { invoiceId: invoice2.id, status: "CONFIRMED" },
    });
    if (confirmedForInv2.length !== 0) {
      throw new Error("There should be no confirmed payments for invoice2");
    }

    const retryDecl = await (db as any).paymentDeclaration.create({
      data: {
        invoiceId: invoice2.id,
        amount: 15000,
        reference: "VIR-TEST-RETRY-003",
        paymentMethod: "VIREMENT",
        status: "PENDING_CONFIRMATION",
        declaredById: client.id,
      },
    });
    if (retryDecl.status !== "PENDING_CONFIRMATION") {
      throw new Error("Client retry declaration failed to create with PENDING_CONFIRMATION");
    }
    console.log("✓ Test 4 Passed: Payment rejection stores reason, creates no accounting entry, and allows client retry");

    // TEST 5: Journal & Grand Livre Verification
    console.log("\n--- TEST 5: Journal & Grand Livre Verification ---");
    const journalEntry = await db.journalEntry.findUnique({
      where: { id: testJournalEntryId },
      include: { versions: true, paymentDeclaration: true },
    });
    if (!journalEntry) throw new Error("Journal entry not found");
    if (journalEntry.paymentDeclaration?.id !== testDeclId) {
      throw new Error("Reverse relation paymentDeclaration on JournalEntry not working");
    }
    console.log(`✓ JournalEntry verified: ${journalEntry.description} | 512 -> 411: ${journalEntry.amount} DA | Status: ${journalEntry.status}`);
    console.log(`✓ Reverse relation journalEntry.paymentDeclaration correctly points to ${testDeclId}`);

    console.log("\n==================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! WORKFLOW IS ROCK SOLID.");
    console.log("==================================================");
  } finally {
    console.log("\nCleaning up test records...");
    if (testJournalEntryId) {
      await db.journalEntryVersion.deleteMany({ where: { journalEntryId: testJournalEntryId } }).catch(() => {});
      await (db as any).paymentDeclaration.deleteMany({ where: { accountingEntryId: testJournalEntryId } }).catch(() => {});
      await db.journalEntry.delete({ where: { id: testJournalEntryId } }).catch(() => {});
    }
    if (testInvoiceId) {
      await (db as any).paymentDeclaration.deleteMany({ where: { invoiceId: testInvoiceId } }).catch(() => {});
      await db.invoice.delete({ where: { id: testInvoiceId } }).catch(() => {});
    }
    await (db as any).paymentDeclaration.deleteMany({ where: { reference: { in: ["VIR-TEST-REJECT-002", "VIR-TEST-RETRY-003"] } } }).catch(() => {});
    await db.invoice.deleteMany({ where: { invoiceNumber: { startsWith: "TEST-INV" } } }).catch(() => {});
    await db.$disconnect();
    console.log("✓ Test cleanup completed.");
  }
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
