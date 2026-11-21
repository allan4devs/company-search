#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.argv[2] || "company-batches/v4-company-names.json");

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "lva");
  const names = await db.collection("comp_companies").find({}, { projection: { _id: 0, name: 1, names: 1 } }).toArray();
  const list = [...new Set(names.flatMap(row => [row.name, ...(Array.isArray(row.names) ? row.names : [])]).filter(name => typeof name === "string" && name.trim()).map(name => name.trim()))].sort((a, b) => a.localeCompare(b));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(list, null, 2)}\n`, "utf8");
  console.log(`Saved ${list.length} company names to ${path.relative(root, output)}.`);
} finally {
  await client.close();
}
