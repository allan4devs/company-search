#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
const inputs = process.argv.slice(2).filter(value => !value.startsWith("--") && value !== arg("--catalog") && value !== arg("--out") && value !== arg("--limit"));
if (process.argv.includes("--help") || inputs.length === 0) {
  console.log("Usage: node scripts/v4-select-new-companies.mjs <lead.json> [lead2.json ...] [--catalog company-batches/v4-company-names.json] [--limit 10] [--out company-batches/v4/new-companies.json]");
  process.exit(inputs.length ? 0 : 2);
}
const catalogPath = path.resolve(arg("--catalog", "company-batches/v4-company-names.json"));
const outPath = path.resolve(arg("--out", "company-batches/v4/new-companies.json"));
const limit = Number(arg("--limit", "10"));
if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("--limit must be between 1 and 1000.");
const readStarted = performance.now();
const docs = await Promise.all(inputs.map(input => fs.readFile(path.resolve(input), "utf8").then(JSON.parse)));
const catalog = await fs.readFile(catalogPath, "utf8").then(JSON.parse);
const inputNames = docs.flatMap(doc => Array.isArray(doc) ? doc : (doc?.candidates || doc?.companies || doc?.leads || []))
  .map(row => typeof row === "string" ? row.trim() : row?.name?.trim()).filter(Boolean);
const readMs = Math.round(performance.now() - readStarted);
const dedupeStarted = performance.now();
const normalize = value => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const known = new Set((Array.isArray(catalog) ? catalog : []).map(normalize));
const seen = new Set();
const unique = [];
for (const name of inputNames) {
  const key = normalize(name);
  if (!key || known.has(key) || seen.has(key)) continue;
  seen.add(key);
  unique.push(name);
}
const dedupeMs = Math.round(performance.now() - dedupeStarted);
const selected = unique.slice(0, limit);
const writeStarted = performance.now();
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(selected, null, 2)}\n`, "utf8");
const writeMs = Math.round(performance.now() - writeStarted);
const report = { inputFiles: inputs, inputNames: inputNames.length, catalogNames: catalog.length, uniqueAgainstCatalogAndBatch: unique.length, selected: selected.length, timingsMs: { readAndMerge: readMs, inMemoryNameDedupe: dedupeMs, write: writeMs, total: readMs + dedupeMs + writeMs } };
const reportPath = outPath.replace(/\.json$/i, "-timing.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`Name-only result: ${outPath}`);
