import { db } from "./lib/db";

async function main() {
  console.log("Deleting notifications...");
  await db.notification.deleteMany();
  
  console.log("Deleting account balances...");
  await db.accountBalance.deleteMany();
  
  console.log("Deleting bank transactions...");
  await db.bankTransaction.deleteMany();
  
  console.log("Deleting journal entries...");
  await db.journalEntry.deleteMany();
  
  console.log("Deleting documents...");
  await db.document.deleteMany();
  
  console.log("History (Journal, Documents, Bank, Balances) has been successfully cleared!");
  console.log("Users and Companies were KEPT.");
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
