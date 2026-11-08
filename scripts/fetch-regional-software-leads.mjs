#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sortlistRegions = [
  ["Costa Rica", "costa-rica-cr"], ["Mexico", "mexico-mx"], ["Colombia", "colombia-co"],
  ["Argentina", "argentina-ar"], ["Chile", "chile-cl"], ["Brazil", "brazil-br"],
  ["Uruguay", "uruguay-uy"], ["Peru", "peru-pe"], ["Panama", "panama-pa"], ["Ecuador", "ecuador-ec"],
  // Expand into fresh LATAM markets after the first ten pages showed high
  // name-level novelty. The shared catalog pass still decides what is new.
  ["Guatemala", "guatemala-gt"], ["El Salvador", "el-salvador-sv"],
  ["Dominican Republic", "dominican-republic-do"], ["Paraguay", "paraguay-py"],
  ["Bolivia", "bolivia-bo"], ["Honduras", "honduras-hn"], ["Nicaragua", "nicaragua-ni"],
];
const providersBase = "https://www.proveedoresdecostarica.com/proveedores/software";

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function visibleText(value) {
  return decode(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function tidyWebsite(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    if (/^(?:www\.)?(?:facebook|instagram|linkedin|x|twitter|youtube|vimeo|tiktok|clutch|sortlist)\./i.test(url.hostname)) return "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow", signal: AbortSignal.timeout(15000),
    headers: { "user-agent": "CompanyDirectoryResearchBot/1.0 (+public company discovery)", accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { url: response.url, html: (await response.text()).slice(0, 4_000_000) };
}

function parseSortlist(html, sourceUrl, region) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!match) return [];
  const data = JSON.parse(match[1]);
  const found = [];
  const seen = new Set();
  function visit(value) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { for (const child of value) visit(child); return; }
    const attributes = value.attributes;
    if (attributes && typeof attributes.name === "string" && typeof attributes.website_url === "string") {
      const website = tidyWebsite(attributes.website_url);
      const profileUrl = typeof attributes.slug === "string" ? `https://www.sortlist.com/agency/${attributes.slug}` : "";
      const key = `${attributes.name.toLowerCase()}|${website}`;
      if (website && !seen.has(key)) {
        found.push({
          name: visibleText(attributes.name), website, domain: new URL(website).hostname,
          ...(profileUrl ? { profileUrl } : {}), directoryLocation: visibleText(attributes.address?.en || ""),
          queryLane: `Sortlist software development directory — ${region}`,
          sourceUrl,
        });
        seen.add(key);
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(data);
  return found;
}

function parseCostaRicaProviders(html, sourceUrl) {
  const byProfile = new Map();
  const pattern = /<a\b[^>]*href="([^"]*\/stream\/empresa\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    let profileUrl;
    try { profileUrl = new URL(decode(match[1]), sourceUrl).href; } catch { continue; }
    const name = visibleText(match[2]);
    if (!name || name.length < 2 || name.length > 140 || /^\+?\s*this\.dataset/i.test(name)) continue;
    const previous = byProfile.get(profileUrl);
    if (!previous || name.length > previous.name.length) {
      byProfile.set(profileUrl, {
        name, profileUrl, directoryProfileUrl: profileUrl,
        queryLane: "Proveedores de Costa Rica software supplier directory",
        sourceUrl,
      });
    }
  }
  return [...byProfile.values()];
}

async function mapLimit(items, limit, callback) {
  const output = Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { output[index] = await callback(items[index], index); }
      catch (error) { output[index] = { error: error instanceof Error ? error.message : String(error) }; }
    }
  }));
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  const options = { out: "company-batches/p007-regional-software-leads-2026-11-07.json", concurrency: 6 };
  for (let index = 0; index < args.length; index += 1) {
    if (["--out", "--concurrency"].includes(args[index])) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${args[index - 1]} requires a value.`);
      if (args[index - 1] === "--out") options.out = value;
      else options.concurrency = Number(value);
    } else if (args[index] === "--help" || args[index] === "-h") {
      console.log("Usage: node scripts/fetch-regional-software-leads.mjs [--out leads.json] [--concurrency 6]");
      return;
    } else throw new Error(`Unknown option: ${args[index]}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 12) throw new Error("--concurrency must be between 1 and 12.");

  const sortlist = await mapLimit(sortlistRegions, options.concurrency, async ([region, slug]) => {
    const url = `https://www.sortlist.com/s/software-development/${slug}`;
    const { url: sourceUrl, html } = await fetchHtml(url);
    return parseSortlist(html, sourceUrl, region);
  });
  const sortlistRows = sortlist.flatMap(rows => Array.isArray(rows) ? rows : []);

  const { url: baseUrl, html: firstPage } = await fetchHtml(providersBase);
  const pageUrls = new Set([baseUrl]);
  for (const match of firstPage.matchAll(/<a\b[^>]*href="([^"]*[?&]p=\d+[^"]*)"/gi)) {
    try { pageUrls.add(new URL(decode(match[1]), baseUrl).href); } catch {}
  }
  const providerPages = await mapLimit([...pageUrls], options.concurrency, async url => {
    const page = url === baseUrl ? { url: baseUrl, html: firstPage } : await fetchHtml(url);
    return parseCostaRicaProviders(page.html, page.url);
  });
  const providerRows = providerPages.flatMap(rows => Array.isArray(rows) ? rows : []);
  const rows = [...sortlistRows, ...providerRows];
  const outPath = path.resolve(root, options.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({
    cohortId: "likes-based-2026-11-07-p007", generatedOn: getCostaRicaDate(), discoveryOnly: true,
    sourceCounts: { sortlistSoftwareDirectory: sortlistRows.length, costaRicaSoftwareSuppliers: providerRows.length },
    candidates: rows,
  }, null, 2)}\n`, "utf8");
  console.log(`Harvested ${rows.length} raw leads from ${sortlistRegions.length + pageUrls.size} directory pages (${sortlistRows.length} regional software providers; ${providerRows.length} Costa Rica software suppliers).`);
  console.log(`Wrote ${path.relative(root, outPath)}. Directory records are leads and must pass Mongo dedupe and first-party verification.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
