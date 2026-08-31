const { createClient } = require("@libsql/client");

async function resetAllData() {
  const url = process.env.DATABASE_URL || "libsql://comptanova-db-twiskou.aws-eu-west-1.turso.io";
  const authToken = process.env.DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODgxOTU5MjAsImlkIjoiMDE5ZTYxYmYtMTYwMS03M2IyLTliYTItYzVlMTExMjc3YjVkIiwia2lkIjoia3lpcUFXdzQ0TVMwYWhnbGt0aWdwOGZldEk2N3lhWmctRm11YV9tdnU5cyIsInJpZCI6Ijc0YjQ1YTJlLTI0ZTAtNGE0ZC1hM2NhLTFjM2M2YzU4ZTlkZSJ9.URUO5CiBJLKvX1aA9TTWt4PZ4FNUWZqyd7Njs29W_jed33VPy___PdlkWgnWAcC23qSCVgr-hETd0psxLmmiCQ";

  const client = createClient({ url, authToken });

  console.log("Emptying all tables on Turso...");

  const tables = [
    "JournalEntryVersion",
    "ReconciliationMatch",
    "ComptableInvitation",
    "FiscalDeadline",
    "FiscalRule",
    "PaymentDeclaration",
    "InvoicePayment",
    "Invoice",
    "BankTransaction",
    "BankStatementImport",
    "JournalEntry",
    "Document",
    "AccountBalance",
    "SubAccount",
    "Notification",
    "AuditLog",
    "Company",
    "User"
  ];

  for (const table of tables) {
    try {
      const res = await client.execute(`DELETE FROM "${table}"`);
      console.log(`Cleared ${table} (${res.rowsAffected} rows deleted)`);
    } catch (e) {
      console.warn(`Table ${table}:`, e.message);
    }
  }

  console.log("\nDATABASE RESET TO 0 COMPLETED!");
}

resetAllData().catch(console.error);
