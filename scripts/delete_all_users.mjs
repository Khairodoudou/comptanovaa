import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^"|"$/g, "")];
    })
);

const client = createClient({
  url: env.DATABASE_URL,
  authToken: env.DATABASE_AUTH_TOKEN,
});

async function deleteAll() {
  const steps = [
    ["AuditLog",            "DELETE FROM AuditLog"],
    ["Message",             "DELETE FROM Message"],
    ["Notification",        "DELETE FROM Notification"],
    ["ReconciliationMatch", "DELETE FROM ReconciliationMatch"],
    ["JournalEntryVersion", "DELETE FROM JournalEntryVersion"],
    ["InvoicePayment",      "DELETE FROM InvoicePayment"],
    ["PaymentDeclaration",  "DELETE FROM PaymentDeclaration"],
    ["Invoice",             "DELETE FROM Invoice"],
    ["BankTransaction",     "DELETE FROM BankTransaction"],
    ["BankStatementImport", "DELETE FROM BankStatementImport"],
    ["JournalEntry",        "DELETE FROM JournalEntry"],
    ["Document",            "DELETE FROM Document"],
    ["AccountBalance",      "DELETE FROM AccountBalance"],
    ["SubAccount",          "DELETE FROM SubAccount"],
    ["FiscalDeadline",      "DELETE FROM FiscalDeadline"],
    ["ComptableInvitation", "DELETE FROM ComptableInvitation"],
    ["Company",             "DELETE FROM Company"],
    ["User",                "DELETE FROM User"],
  ];

  await client.execute("PRAGMA foreign_keys = OFF");

  for (const [label, sql] of steps) {
    process.stdout.write(`Deleting ${label}... `);
    const res = await client.execute(sql);
    console.log(`✓ (${res.rowsAffected} rows)`);
  }

  await client.execute("PRAGMA foreign_keys = ON");

  const check = await client.execute("SELECT COUNT(*) as count FROM User");
  console.log(`\nRemaining users in database: ${check.rows[0].count}`);
  console.log("✅ All users and associated data deleted successfully!");
}

deleteAll()
  .catch((err) => {
    console.error("\n❌ Failed:", err.message);
    process.exit(1);
  })
  .finally(() => client.close());
