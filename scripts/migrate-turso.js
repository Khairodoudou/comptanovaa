const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");

async function migrate() {
  const url = process.env.DATABASE_URL || "libsql://comptanova-db-twiskou.aws-eu-west-1.turso.io";
  const authToken = process.env.DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODgxOTU5MjAsImlkIjoiMDE5ZTYxYmYtMTYwMS03M2IyLTliYTItYzVlMTExMjc3YjVkIiwia2lkIjoia3lpcUFXdzQ0TVMwYWhnbGt0aWdwOGZldEk2N3lhWmctRm11YV9tdnU5cyIsInJpZCI6Ijc0YjQ1YTJlLTI0ZTAtNGE0ZC1hM2NhLTFjM2M2YzU4ZTlkZSJ9.URUO5CiBJLKvX1aA9TTWt4PZ4FNUWZqyd7Njs29W_jed33VPy___PdlkWgnWAcC23qSCVgr-hETd0psxLmmiCQ";

  const client = createClient({ url, authToken });

  const migrationFile = path.join(__dirname, "..", "prisma", "migrations", "20260831143127_add_taysir_features", "migration.sql");
  const rawSql = fs.readFileSync(migrationFile, "utf8");

  // Regex split by semicolon that are at the end of statements
  const statements = rawSql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--") && s !== "PRAGMA foreign_keys=OFF" && s !== "PRAGMA foreign_keys=ON" && s !== "PRAGMA defer_foreign_keys=OFF" && s !== "PRAGMA defer_foreign_keys=ON");

  console.log(`Executing ${statements.length} explicit SQL statements...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await client.execute(stmt);
      const firstLine = stmt.split("\n")[0].substring(0, 50);
      console.log(`[${i + 1}/${statements.length}] SUCCESS: ${firstLine}`);
    } catch (err) {
      console.error(`[${i + 1}/${statements.length}] FAILED:`, err.message);
    }
  }

  const res = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log("\nTables now in Turso:");
  console.log(res.rows.map(r => r.name));
}

migrate().catch(console.error);
