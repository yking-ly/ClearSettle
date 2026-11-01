import { readFile } from "node:fs/promises";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const migrationUrl = new URL("../db/migrations/0001_durable_paypal.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql.unsafe(migration);
  console.log("Applied 0001_durable_paypal.sql");
} finally {
  await sql.end();
}
