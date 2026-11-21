#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";

const input = path.resolve(process.argv[2] || "company-batches/v4-latam-engineering-2026-11-11/new-company-names.json");
const batchId = process.argv[3] || "v4-names-2026-11-11";
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
const names = JSON.parse(await fs.readFile(input, "utf8"));
if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== "string" || !name.trim())) throw new Error("Input must be a non-empty JSON array of company names.");
const normalize = name => String(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const collection = client.db(process.env.MONGODB_DB || "lva").collection("comp_companies");
  const existing = await collection.find({}, { projection: { _id: 1, key: 1, name: 1, names: 1, tags: 1, extraction: 1 } }).toArray();
  const index = new Map();
  for (const company of existing) for (const name of [company.name, ...(company.names || [])]) {
    const key = normalize(name);
    if (key && !index.has(key)) index.set(key, company);
  }
  const now = new Date();
  const writes = [];
  const outcomes = [];
  for (const rawName of [...new Set(names.map(name => name.trim()))]) {
    const normalized = normalize(rawName);
    if (!normalized) continue;
    const old = index.get(normalized);
    const id = old?._id || `company-${normalized}`;
    const fields = old
      ? { tags: [...new Set([...(old.tags || []), "new"])], extraction: { ...(old.extraction || {}), status: old.extraction?.status || "pending", batchId, updatedAt: now.toISOString() } }
      : { key: id, name: rawName, names: [rawName], tracks: [], locations: [], records: 0, model: "unknown", tags: ["new"], jobs: [], sourceEvidence: [], categories: ["othermodel", "othertech", "otherrole", "otherlevel"], extraction: { status: "pending", batchId, updatedAt: now.toISOString() } };
    writes.push({ updateOne: { filter: { _id: id }, update: { $set: fields }, upsert: true } });
    outcomes.push({ name: rawName, matchedExisting: Boolean(old) });
    if (!old) index.set(normalized, { _id: id, name: rawName, names: [rawName], tags: ["new"] });
  }
  const result = writes.length ? await collection.bulkWrite(writes, { ordered: true }) : null;
  console.log(JSON.stringify({ batchId, requested: names.length, processed: writes.length, inserted: result?.upsertedCount || 0, matchedAndTagged: result?.matchedCount || 0, companies: outcomes }, null, 2));
} finally {
  await client.close();
}
