import { db } from "./lib/db";

async function main() {
  console.log("Deleting audit logs...");
  await db.auditLog.deleteMany();

  console.log("Deleting messages...");
  await db.message.deleteMany();

  console.log("Deleting notifications...");
  await db.notification.deleteMany();

  console.log("Deleting reconciliation matches...");
  await db.reconciliationMatch.deleteMany();

  console.log("Deleting journal entry versions...");
  await db.journalEntryVersion.deleteMany();

  console.log("Deleting invoice payments...");
  await db.invoicePayment.deleteMany();

  console.log("Deleting payment declarations...");
  await db.paymentDeclaration.deleteMany();

  console.log("Deleting invoices...");
  await db.invoice.deleteMany();

  console.log("Deleting bank transactions...");
  await db.bankTransaction.deleteMany();

  console.log("Deleting bank statement imports...");
  await db.bankStatementImport.deleteMany();

  console.log("Deleting journal entries...");
  await db.journalEntry.deleteMany();

  console.log("Deleting documents...");
  await db.document.deleteMany();

  console.log("Deleting account balances...");
  await db.accountBalance.deleteMany();

  console.log("Deleting sub accounts...");
  await db.subAccount.deleteMany();

  console.log("Deleting accounting memories...");
  await db.accountingMemory.deleteMany();

  console.log("Deleting fiscal deadlines...");
  await db.fiscalDeadline.deleteMany();

  console.log("Deleting comptable invitations...");
  await db.comptableInvitation.deleteMany();

  console.log("Deleting companies...");
  await db.company.deleteMany();

  console.log("Deleting users...");
  await db.user.deleteMany();

  console.log("All users and associated data have been successfully deleted!");
}

main()
  .catch(console.error)
