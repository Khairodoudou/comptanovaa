const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Deleting notifications...");
  await prisma.notification.deleteMany();
  
  console.log("Deleting account balances...");
  await prisma.accountBalance.deleteMany();
  
  console.log("Deleting sub accounts...");
  await prisma.subAccount.deleteMany();
  
  console.log("Deleting bank transactions...");
  await prisma.bankTransaction.deleteMany();
  
  console.log("Deleting journal entries...");
  await prisma.journalEntry.deleteMany();
  
  console.log("Deleting documents...");
  await prisma.document.deleteMany();
  
  console.log("Deleting companies...");
  await prisma.company.deleteMany();
  
  console.log("Deleting users...");
  await prisma.user.deleteMany();
  
  console.log("All users and associated data have been successfully deleted!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
