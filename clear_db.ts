import { db } from "./lib/db";

async function main() {
  console.log("Deleting notifications...");
  await db.notification.deleteMany();
  
  console.log("Deleting account balances...");
  await db.accountBalance.deleteMany();
  
  console.log("Deleting sub accounts...");
  await db.subAccount.deleteMany();
  
  console.log("Deleting bank transactions...");
  await db.bankTransaction.deleteMany();
  
  console.log("Deleting journal entries...");
  await db.journalEntry.deleteMany();
  
  console.log("Deleting documents...");
  await db.document.deleteMany();
  
  console.log("Deleting companies...");
  await db.company.deleteMany();
  
  console.log("Deleting users...");
  await db.user.deleteMany();
  
  console.log("All users and associated data have been successfully deleted!");
}

main()
  .catch(console.error)
