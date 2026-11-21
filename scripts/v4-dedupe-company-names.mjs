#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (["--catalog", "--out"].includes(args[i])) options[args[i].slice(2)] = args[++i];
    else if (args[i].startsWith("--")) throw new Error(`Unknown option ${args[i]}`);
    else if (!options.input) options.input = args[i];
    else throw new Error("Provide only one input file.");
  }
  return options;
}
const { input, catalog = "company-batches/v4-company-names.json", out } = parseArgs(process.argv.slice(2));
if (!input || process.argv.includes("--help")) {
  console.log("Usage: node scripts/v4-dedupe-company-names.mjs <new-names.json> [--catalog company-batches/v4-company-names.json] [--out company-batches/v4/new-names.json]");
  process.exit(input ? 0 : 2);
}
function key(name) { return String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, ""); }
function unwrap(value) { return Array.isArray(value) ? value : value?.companies || value?.candidates || value?.leads || []; }
const [incomingRaw, catalogRaw] = await Promise.all([
  fs.readFile(path.resolve(input), "utf8").then(JSON.parse),
  fs.readFile(path.resolve(catalog), "utf8").then(JSON.parse),
]);
const incoming = unwrap(incomingRaw).map(row => typeof row === "string" ? row.trim() : row?.name?.trim()).filter(Boolean);
const known = new Set(unwrap(catalogRaw).map(row => typeof row === "string" ? row : row?.name).filter(Boolean).map(key));
const added = [], duplicates = [];
for (const name of incoming) {
  const normalized = key(name);
  if (!normalized || known.has(normalized)) { duplicates.push(name); continue; }
  known.add(normalized);
  added.push(name);
}
const output = path.resolve(out || `company-batches/v4/${path.basename(input, path.extname(input))}-unique.json`);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(added, null, 2)}\n`, "utf8");
console.log(`Input ${incoming.length}; duplicates ${duplicates.length}; new names ${added.length}.`);
console.log(`Saved name-only array: ${path.relative(root, output)}`);
