require("dotenv").config();
const { createClient } = require("@libsql/client");

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url) {
  console.error("❌ DATABASE_URL non trouvée dans .env");
  process.exit(1);
}

const client = createClient({
  url,
  authToken,
});

async function main() {
  console.log("🔗 Connexion à la base de données Turso :", url);

  // Lister les utilisateurs actuels
  const resUsers = await client.execute("SELECT id, name, email, role FROM User");
  console.log(`\n📋 Utilisateurs trouvés dans la table User : ${resUsers.rows.length}`);
  
  for (const row of resUsers.rows) {
    console.log(` - [${row.role}] ${row.name} (${row.email}) | ID: ${row.id}`);
  }

  if (resUsers.rows.length === 0) {
    console.log("\n✅ La table User est déjà vide !");
    return;
  }

  console.log("\n🧹 Suppression de toutes les données et utilisateurs en cours...");

  await client.execute("PRAGMA foreign_keys = OFF;");

  const tablesToClear = [
    "Notification",
    "AuditLog",
    "ComptableInvitation",
    "PaymentDeclaration",
    "ReconciliationMatch",
    "FiscalDeadline",
    "JournalEntryVersion",
    "SubAccount",
    "JournalEntry",
    "Invoice",
    "BankTransaction",
    "AccountBalance",
    "Document",
    "Company",
    "User",
  ];

  for (const table of tablesToClear) {
    try {
      const res = await client.execute(`DELETE FROM "${table}"`);
      console.log(` ✓ Table ${table} vidée (${res.rowsAffected} lignes supprimées)`);
    } catch (err) {
      console.warn(` ⚠️ Table ${table} : ${err.message}`);
    }
  }

  await client.execute("PRAGMA foreign_keys = ON;");

  const verify = await client.execute("SELECT COUNT(*) as count FROM User");
  console.log(`\n🎉 Opération réussie ! Utilisateurs restants dans la table User : ${verify.rows[0].count}`);
}

main()
  .catch((err) => {
    console.error("❌ Erreur :", err);
    process.exit(1);
  });

