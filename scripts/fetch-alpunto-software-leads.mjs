#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "https://alpunto.cr";
const listings = [
  { url: `${base}/en/services/software-as-a-service`, lane: "Alpunto Costa Rica SaaS/software company directory" },
  { url: `${base}/en/services/developers-graphic-designers`, lane: "Alpunto Costa Rica software developer directory" },
];

function decode(value) { return String(value || "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function visible(value) { return decode(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }

async function getHtml(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function parseCompanies(html, pageUrl, lane) {
  const byUrl = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']*\/en\/business\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = visible(match[2]);
    if (!name || /^view$/i.test(name)) continue;
    const profileUrl = new URL(decode(match[1]), base).href;
    if (!byUrl.has(profileUrl)) byUrl.set(profileUrl, { name, profileUrl, directoryProfileUrl: profileUrl, queryLane: lane, sourceUrl: pageUrl });
  }
  return [...byUrl.values()];
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : "company-batches/alpunto-software-name-leads.json";
  const results = await Promise.all(listings.map(async route => {
    const first = await getHtml(route.url);
    const pages = Math.max(1, ...[...first.matchAll(/[?&]page=(\d+)/g)].map(match => Number(match[1])));
    const htmls = [first, ...(await Promise.all(Array.from({ length: pages - 1 }, (_, index) => getHtml(`${route.url}?page=${index + 2}`))))];
    return { route, pages, rows: htmls.flatMap((html, index) => parseCompanies(html, index === 0 ? route.url : `${route.url}?page=${index + 1}`, route.lane)) };
  }));
  const pages = results.reduce((sum, item) => sum + item.pages, 0);
  const byProfile = new Map(results.flatMap(item => item.rows).map(item => [item.profileUrl, item]));
  const candidates = [...byProfile.values()];
  const outPath = path.resolve(root, out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ cohortId: "likes-based-2026-11-07-p007", generatedOn: getCostaRicaDate(), source: "Alpunto Costa Rica software and SaaS directories (lead source; verify official employer sites)", listingPages: pages, candidates }, null, 2)}\n`, "utf8");
  console.log(`Collected ${candidates.length} company profile leads from ${pages} software/SaaS directory pages; wrote ${path.relative(root, outPath)}.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
