#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "https://aworkado.co";
const routes = [
  { region: "Costa Rica", slug: "costa-rica", lane: "Aworkado remote software engineering — Costa Rica" },
  { region: "Latin America", slug: "latin-america", lane: "Aworkado remote software engineering — LATAM postings" },
];

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function clean(value) { return decode(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }

function parseCards(html, route) {
  const chunks = [...html.matchAll(/<div data-track-item="\d+"[^>]*class="job-card[^>]*>([\s\S]*?)(?=<div data-track-item="\d+"|<\/div>\s*<\/div>\s*<nav|$)/gi)].map(m => m[1]);
  const rows = [];
  for (const chunk of chunks) {
    const company = chunk.match(/<a\b[^>]*class="job-card-company"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const job = chunk.match(/<a\b[^>]*class="job-card-title"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!company || !job) continue;
    const countriesPart = chunk.match(/<div class="job-card-countries"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] || "";
    const locations = [...new Set([...countriesPart.matchAll(/<span>([^<]+)<\/span>/gi)].map(m => clean(m[1])).filter(Boolean))];
    const title = clean(job[2]);
    const isCostaRicaEligible = /costa\s+rica/i.test(locations.join(" ")) || /\bCR\b/i.test(title);
    const isLatamExplicit = /\bLATAM\b|Latin America/i.test(title);
    if (route.region === "Costa Rica" && !isCostaRicaEligible) continue;
    if (route.region === "Latin America" && !isCostaRicaEligible && !isLatamExplicit) continue;
    const profileUrl = new URL(company[1], base).href;
    rows.push({
      name: clean(company[2]),
      profileUrl,
      directoryProfileUrl: profileUrl,
      sourceJobUrl: new URL(job[1], base).href,
      roleTitle: title,
      roleLocations: locations,
      queryLane: isCostaRicaEligible ? routes[0].lane : route.lane,
      sourceUrl: new URL(route.slug === "costa-rica" ? `/remote/software-engineering/${route.slug}` : `/remote/software-engineering/${route.slug}`, base).href,
      locationLead: isCostaRicaEligible ? "Costa Rica" : "LATAM",
    });
  }
  return rows;
}

async function getHtml(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function pagesFor(route) {
  const firstUrl = `${base}/remote/software-engineering/${route.slug}`;
  const first = await getHtml(firstUrl);
  const pages = route.region === "Costa Rica"
    ? Math.max(1, ...[...first.matchAll(/[?&]page=(\d+)/g)].map(m => Number(m[1])))
    : Math.max(1, ...[...first.matchAll(/[?&]page=(\d+)/g)].map(m => Number(m[1])));
  const pageHtmls = [first];
  const remaining = Array.from({ length: pages - 1 }, (_, i) => `${firstUrl}?page=${i + 1}`);
  const fetched = await Promise.all(remaining.map(getHtml));
  pageHtmls.push(...fetched);
  return pageHtmls.flatMap(html => parseCards(html, route));
}

async function main() {
  const outArg = process.argv.findIndex(arg => arg === "--out");
  const out = outArg >= 0 ? process.argv[outArg + 1] : "company-batches/aworkado-latam-career-leads.json";
  const rows = (await Promise.all(routes.map(pagesFor))).flat();
  const byCompany = new Map();
  for (const row of rows) {
    const key = row.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const current = byCompany.get(key);
    if (!current || (row.locationLead === "Costa Rica" && current.locationLead !== "Costa Rica")) byCompany.set(key, row);
  }
  const candidates = [...byCompany.values()];
  const outPath = path.resolve(root, out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ cohortId: "likes-based-2026-11-07-p007", generatedOn: getCostaRicaDate(), source: "Aworkado LATAM remote software engineering listings (third-party lead source; verify official employer pages)", rawRoleLeadCount: rows.length, candidates }, null, 2)}\n`, "utf8");
  console.log(`Collected ${rows.length} eligible role leads across Costa Rica and LATAM; reduced them to ${candidates.length} distinct company names.`);
  console.log(`Wrote ${path.relative(root, outPath)}. Aworkado is a lead source only; official employer evidence is required before import.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
