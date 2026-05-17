const { PrismaClient } = require('@prisma/client');
const { PrismaLibSql } = require('@prisma/adapter-libsql');

const adapter = new PrismaLibSql({ url: 'file:./prisma/dev.db' });
const db = new PrismaClient({ adapter });

async function main() {
  // Afficher les utilisateurs avant suppression
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true }
  });

  console.log(`\nUtilisateurs trouvés : ${users.length}`);
  if (users.length === 0) {
    console.log('Aucun utilisateur à supprimer.');
    return;
  }
  users.forEach(u => console.log(` - [${u.role}] ${u.name} | ${u.email}`));

  // Supprimer dans l'ordre FK (enfants d'abord)
  console.log('\nSuppression en cours...');
  const n1 = await db.notification.deleteMany({});
  console.log(` ✓ Notifications supprimées : ${n1.count}`);

  const b1 = await db.bankTransaction.deleteMany({});
  console.log(` ✓ BankTransactions supprimées : ${b1.count}`);

  const ab = await db.accountBalance.deleteMany({});
  console.log(` ✓ AccountBalances supprimées : ${ab.count}`);

  const je = await db.journalEntry.deleteMany({});
  console.log(` ✓ JournalEntries supprimées : ${je.count}`);

  const d1 = await db.document.deleteMany({});
  console.log(` ✓ Documents supprimés : ${d1.count}`);

  const c1 = await db.company.deleteMany({});
  console.log(` ✓ Entreprises supprimées : ${c1.count}`);

  const u1 = await db.user.deleteMany({});
  console.log(` ✓ Utilisateurs supprimés : ${u1.count}`);

  const remaining = await db.user.count();
  console.log(`\n✅ Terminé. Utilisateurs restants : ${remaining}`);
}

main()
  .catch(e => { console.error('❌ Erreur :', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
