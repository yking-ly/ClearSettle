import { readdir, readFile } from "node:fs/promises";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const migrationsUrl = new URL("../db/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationsUrl)).filter((file) => file.endsWith(".sql")).sort();
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  for (const file of migrationFiles) {
    await sql.unsafe(await readFile(new URL(file, migrationsUrl), "utf8"));
    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end();
}
