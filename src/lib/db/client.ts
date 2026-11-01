import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

let database: PostgresJsDatabase<typeof schema> | undefined;
let client: ReturnType<typeof postgres> | undefined;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  if (!database) {
    client = postgres(databaseUrl, { max: 5, prepare: false });
    database = drizzle(client, { schema });
  }

  return database;
}

export async function closeDatabase() {
  await client?.end();
  client = undefined;
  database = undefined;
}
