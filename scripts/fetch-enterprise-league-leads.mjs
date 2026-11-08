#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const regions = [
  ["Central America", "ca-central"], ["Mexico", "mexico"], ["Colombia", "colombia"],
  ["Argentina", "argentina"], ["South America", "south-america"], ["Costa Rica", "costa-rica"],
  ["Peru", "peru"], ["Uruguay", "uruguay"], ["Chile", "chile"], ["Guatemala", "guatemala"],
  ["Panama", "panama"], ["Brazil", "brazil"], ["Ecuador", "ecuador"],
];

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function text(value) { return decode(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow", signal: AbortSignal.timeout(15000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { url: response.url, html: (await response.text()).slice(0, 5_000_000) };
}

function parseDirectory(html, sourceUrl, region) {
  const byProfile = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]*\/company\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let profileUrl;
    try { profileUrl = new URL(decode(match[1]), sourceUrl).href; } catch { continue; }
    const name = text(match[2]);
    if (!name || name.length < 2 || name.length > 140 || /^(view profile|company search|home)$/i.test(name)) continue;
    const previous = byProfile.get(profileUrl);
    if (!previous || name.length > previous.name.length) byProfile.set(profileUrl, {
      name, profileUrl, directoryProfileUrl: profileUrl,
      queryLane: `Enterprise League software directory — ${region}`,
      sourceUrl,
    });
  }
  return [...byProfile.values()];
}

async function mapLimit(items, limit, callback) {
  const output = Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { output[index] = await callback(items[index]); }
      catch (error) { output[index] = { error: error instanceof Error ? error.message : String(error) }; }
    }
  }));
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  const options = { out: "company-batches/p007-enterprise-league-name-leads.json", concurrency: 5 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--out", "--concurrency"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--out") options.out = value;
      else options.concurrency = Number(value);
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/fetch-enterprise-league-leads.mjs [--out leads.json] [--concurrency 5]");
      return;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 10) throw new Error("--concurrency must be between 1 and 10.");
  const pages = await mapLimit(regions, options.concurrency, async ([region, slug]) => {
    const url = `https://enterpriseleague.com/directory/software/${slug}`;
    const { url: sourceUrl, html } = await fetchHtml(url);
    return parseDirectory(html, sourceUrl, region);
  });
  const candidates = pages.flatMap(page => Array.isArray(page) ? page : []);
  const outPath = path.resolve(root, options.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({
    cohortId: "likes-based-2026-11-07-p007", generatedOn: getCostaRicaDate(), discoveryOnly: true,
    sourceCounts: Object.fromEntries(regions.map(([region], index) => [region, pages[index]?.length || 0])), candidates,
  }, null, 2)}\n`, "utf8");
  console.log(`Collected ${candidates.length} name/profile leads from ${regions.length} regional software directories.`);
  console.log(`Wrote ${path.relative(root, outPath)}; profile websites are resolved only after Mongo name dedupe.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
