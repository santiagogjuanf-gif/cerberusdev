/**
 * Script to run database migrations
 * Usage: node run-migration.js
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const db = require("./config/db");

async function runMigrations() {
  console.log("🚀 Running migrations...\n");

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  for (const file of files) {
    console.log(`📄 Running: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    // Split by semicolon and run each statement
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));

    for (const stmt of statements) {
      try {
        await db.execute(stmt);
        console.log(`   ✅ Statement executed`);
      } catch (err) {
        // Ignore "column already exists" or "table already exists" errors
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`   ⏭️  Skipped (already exists)`);
        } else {
          console.error(`   ❌ Error: ${err.message}`);
        }
      }
    }
    console.log("");
  }

  console.log("✅ Migrations complete!");
  process.exit(0);
}

runMigrations().catch(err => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
