#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceUrl = "https://www.cinde.org/es/sectores/servicios-intensivos-conocimiento/digital";
const defaultOut = `company-batches/cinde-digital-leads-${getCostaRicaDate()}.json`;
const focus = /software|ciberseguridad|cloud|nube|inteligencia artificial|datos|data|automatizaci[oó]n|tecnolog[ií]a|ingenier[ií]a/i;

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function parseArgs(args) {
  const options = { out: defaultOut };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--out") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("--out requires a path.");
      options.out = value;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/fetch-cinde-digital-leads.mjs [--out leads.json]");
    console.log("Collects companies listed in relevant technology categories on CINDE's Costa Rica digital-sector page; these are leads, not verified employers.");
    return;
  }

  const response = await fetch(sourceUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: { "user-agent": "CompanyDirectoryResearchBot/1.0 (+public company discovery)", accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`CINDE directory returned HTTP ${response.status}.`);
  const html = await response.text();
  const companies = new Map();
  for (const blockMatch of html.matchAll(/<div class="gc-1-4">([\s\S]*?)<\/div>/gi)) {
    const block = blockMatch[1];
    const categoryMatch = block.match(/<span>([\s\S]*?)<\/span>/i);
    const category = decode(categoryMatch?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!focus.test(category)) continue;
    for (const companyMatch of block.matchAll(/<p\b[^>]*title="([^"]+)"[^>]*>/gi)) {
      const name = decode(companyMatch[1]).replace(/\s+/g, " ").trim();
      if (!name) continue;
      const key = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const current = companies.get(key) || { name, categories: [] };
      if (!current.categories.includes(category)) current.categories.push(category);
      companies.set(key, current);
    }
  }

  const candidates = [...companies.values()].map(company => ({
    ...company,
    sourceUrl,
    queryLane: `CINDE Costa Rica digital roster: ${company.categories.join(", ")}`,
    countrySignal: "Costa Rica digital-sector listing; verify employer and role fit on first-party sources",
  }));
  const outputPath = path.resolve(root, options.out);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({ cohortId: `cinde-cr-${getCostaRicaDate()}`, generatedOn: getCostaRicaDate(), discoveryOnly: true, source: sourceUrl, candidateCount: candidates.length, candidates }, null, 2)}\n`, "utf8");
  console.log(`Collected ${candidates.length} unique CINDE digital-sector company leads from the official Costa Rica roster.`);
  console.log(`Wrote ${path.relative(root, outputPath)}; official sites and engineering roles still need verification.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
