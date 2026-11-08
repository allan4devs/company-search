#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceUrl = "https://thenearshorehub.com/es/empresas/";

function parseArgs(args) {
  const options = { out: `company-batches/nearshorehub-latam-leads-${getCostaRicaDate()}.json`, concurrency: 6 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (["--out", "--enrich", "--concurrency"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--out") options.out = value;
      else if (arg === "--enrich") options.enrich = value;
      else options.concurrency = Number(value);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw new Error("--concurrency must be between 1 and 8 for the directory host.");
  return options;
}

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function text(value) {
  return decode(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? "")]));
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    headers: { "user-agent": "CompanyDirectoryResearchBot/1.0 (+public company discovery)", accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${url}`);
  const contentType = response.headers.get("content-type") || "";
  if (!/text\/html|xhtml/i.test(contentType)) throw new Error(`not-html:${contentType || "unknown content type"}`);
  return { url: response.url, html: (await response.text()).slice(0, 2_000_000) };
}

function listingLeads(html, pageUrl) {
  const candidates = [];
  const seen = new Set();
  for (const match of html.matchAll(/<a\b[^>]*class="[^"]*\bco__main\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi)) {
    const openTag = match[0].slice(0, match[0].indexOf(">") + 1);
    const href = attributes(openTag).href;
    const name = decode(match[0].match(/<span\b[^>]*class="[^"]*\bco__name\b[^"]*"[^>]*>([^<]+)/i)?.[1] || "").trim();
    if (!href || !name) continue;
    try {
      const profileUrl = new URL(href, pageUrl).href;
      if (!new URL(profileUrl).pathname.startsWith("/es/empresas/") || seen.has(profileUrl)) continue;
      seen.add(profileUrl);
      candidates.push({ name, profileUrl, directoryProfileUrl: profileUrl, queryLane: "Nearshore Hub Latin America software provider directory", sourceUrl: pageUrl });
    } catch {}
  }
  return candidates;
}

function officialWebsiteFromProfile(html, profileUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const openTag = match[0].slice(0, match[0].indexOf(">") + 1);
    const attrs = attributes(openTag);
    if (!attrs.href) continue;
    try {
      const url = new URL(attrs.href, profileUrl);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!/^https?:$/.test(url.protocol) || host === "thenearshorehub.com" || host.endsWith(".thenearshorehub.com")) continue;
      if (/(^|\.)(linkedin\.com|facebook\.com|instagram\.com|youtube\.com|x\.com|twitter\.com|crecerank\.com|wa\.me)$/i.test(host)) continue;
      links.push({ url: `${url.protocol}//${url.host}/`, label: text(match[0]) });
    } catch {}
  }
  return links.find(link => /^(ir al sitio|visit site|website|sitio web|sitio oficial)$/i.test(link.label))?.url
    || links.find(link => /^(fuente|source)$/i.test(link.label))?.url
    || "";
}

async function mapPool(items, concurrency, worker) {
  const results = Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await worker(items[index]); }
      catch (error) { results[index] = { ...items[index], profileFetchError: error instanceof Error ? error.message : String(error) }; }
    }
  }));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/fetch-nearshorehub-company-leads.mjs [--out leads.json]");
    console.log("       node scripts/fetch-nearshorehub-company-leads.mjs --enrich name-unique-leads.json [--concurrency 6] [--out resolved-leads.json]");
    console.log("Harvest names first, run Mongo name dedupe, then fetch directory profiles only for unique survivors.");
    return;
  }

  let candidates;
  if (options.enrich) {
    const input = JSON.parse(await fs.readFile(path.resolve(root, options.enrich), "utf8"));
    const uniqueNames = Array.isArray(input) ? input : input.candidates || input.leads || input.companies || [];
    const leads = uniqueNames.filter(candidate => candidate?.name && (candidate.profileUrl || candidate.directoryProfileUrl));
    candidates = await mapPool(leads, options.concurrency, async candidate => {
      const profileUrl = candidate.profileUrl || candidate.directoryProfileUrl;
      const page = await fetchHtml(profileUrl);
      const { profileFetchError, ...resolved } = candidate;
      return {
        ...resolved,
        website: officialWebsiteFromProfile(page.html, page.url),
        profilePageUrl: page.url,
        profileFetchStatus: 200,
      };
    });
  } else {
    const page = await fetchHtml(sourceUrl);
    candidates = listingLeads(page.html, page.url);
  }

  const outPath = path.resolve(root, options.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({
    cohortId: `nearshorehub-latam-${getCostaRicaDate()}`,
    generatedOn: getCostaRicaDate(),
    discoveryOnly: true,
    source: sourceUrl,
    inputCount: candidates.length,
    resolvedSiteCount: candidates.filter(candidate => candidate.website).length,
    candidates,
  }, null, 2)}\n`, "utf8");
  console.log(options.enrich
    ? `Fetched ${candidates.length} name-unique profiles; ${candidates.filter(candidate => candidate.website).length} contain an official website.`
    : `Collected ${candidates.length} Latin American nearshore software company names; no profiles fetched before dedupe.`);
  console.log(`Wrote ${path.relative(root, outPath)}; these are discovery leads, not verified import records.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
