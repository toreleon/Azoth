import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const path = process.env.VNSTOCK_DB ?? "./vnstock.db";
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(resolve("src/storage/schema.sql"), "utf8");
  db.exec(schema);
  return db;
}
