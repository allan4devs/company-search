#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "https://www.proveedoresdecostarica.com/proveedores/software";

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#038;/g, "&");
}
function clean(value) { return decode(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }

async function getPage(page) {
  const url = page === 1 ? base : `${base}?p=${page}`;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return { url: response.url, html: await response.text() };
}

function parsePage(html, sourceUrl, page) {
  const rows = [];
  const seen = new Set();
  for (const match of String(html).matchAll(/<a\b[^>]*href=(?:"([^"]*\/stream\/empresa\/[^"#?]+)"|'([^']*\/stream\/empresa\/[^'#?]+)')[^>]*>([\s\S]*?)<\/a>/gi)) {
    const profileUrl = decode(match[1] || match[2]);
    const name = clean(match[3]);
    const key = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ name, profileUrl: new URL(profileUrl, sourceUrl).href, sourceUrl, queryLane: "Proveedores de Costa Rica software suppliers directory", sourcePage: page });
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : "company-batches/proveedores-software-cr-leads.json";
  const pageResults = await Promise.all(Array.from({ length: 10 }, (_, index) => getPage(index + 1)));
  const byName = new Map();
  for (const page of pageResults) for (const row of parsePage(page.html, page.url, Number(new URL(page.url).searchParams.get("p") || 1))) {
    const key = row.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!byName.has(key)) byName.set(key, row);
  }
  const candidates = [...byName.values()];
  const outPath = path.resolve(root, out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ cohortId: `proveedores-cr-${getCostaRicaDate()}`, generatedOn: getCostaRicaDate(), discoveryOnly: true, source: "Proveedores de Costa Rica software supplier listings; names and directory location are leads only", candidateCount: candidates.length, sourcePages: pageResults.length, candidates }, null, 2)}\n`, "utf8");
  console.log(`Collected ${candidates.length} unique vendor-name leads from ${pageResults.length} category pages.`);
  console.log(`Wrote ${path.relative(root, outPath)}; verify each candidate on its official site before import.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
