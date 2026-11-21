#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "company-batches", "v4", "search-pages.json");
const [command, ...args] = process.argv.slice(2);
const query = args[0]?.trim();
if (!command || command === "--help" || command === "-h") {
  console.log("Usage: node scripts/v4-search-pages.mjs status <query> | next <query> [--page N]");
  process.exit(0);
}
if (!query) throw new Error("Provide the exact search query as one quoted argument.");
const state = await fs.readFile(file, "utf8").then(JSON.parse).catch(() => ({}));
if (command === "status") {
  console.log(JSON.stringify(state[query] || { query, lastPage: 0, searches: 0 }, null, 2));
} else if (command === "next") {
  const pageIndex = args.indexOf("--page");
  const explicit = pageIndex >= 0 ? Number(args[pageIndex + 1]) : NaN;
  const previous = state[query] || { lastPage: 0, searches: 0 };
  const page = Number.isInteger(explicit) && explicit > 0 ? explicit : previous.lastPage + 1;
  state[query] = { query, lastPage: page, searches: previous.searches + 1, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(`Search ${state[query].searches}: start at page ${page} for: ${query}`);
} else throw new Error(`Unknown command: ${command}`);
