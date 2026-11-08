#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = "https://www.globallyremotejobs.com/country/cr";
const jobPattern = /software|engineer|engineering|developer|development|programmer|devops|sre|quality assurance|\bqa\b|data engineer|data scientist|platform engineer|security engineer|automation engineer|full.?stack|backend|front.?end/i;
const relevantCategoryPattern = /software|backend|data engineering|data science|analytics engineering|devops|sre|data platform|engineering|security/i;
const locationPattern = /Costa\s+Rica|\bLATAM\b|Latin America/i;

function parseArgs(args) {
  const options = { out: "company-batches/globallyremote-cr-leads.json", concurrency: 12 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (["--out", "--concurrency"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--out") options.out = value;
      else options.concurrency = Number(value);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 30) throw new Error("--concurrency must be between 1 and 30.");
  return options;
}

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function textFromHtml(value) {
  return decode(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: { "user-agent": "CompanyDirectoryResearchBot/1.0 (+public employer job discovery)", accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${url}`);
  return response.text();
}

function countFromPage(html) {
  const text = textFromHtml(html);
  const match = text.match(/([\d,]+)\s+jobs\b/i);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

function parsePage(html, pageUrl) {
  const jobs = [];
  for (const match of html.matchAll(/<article\b[\s\S]*?<\/article>/gi)) {
    const card = match[0];
    const titleAnchor = card.match(/<h3\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const companyMatch = card.match(/<p\s+class="text-muted">([\s\S]*?)<\/p>/i);
    const locationStart = card.indexOf('data-testid="location-plate"');
    const locationEnd = card.indexOf('aria-label="Job details"', locationStart);
    const locationText = locationStart >= 0
      ? textFromHtml(card.slice(locationStart, locationEnd >= 0 ? locationEnd : locationStart + 1200))
      : "";
    const categoryMatch = card.match(/<ul\b[^>]*aria-label="Job details"[^>]*>([\s\S]*?)<\/ul>/i);
    const categories = categoryMatch
      ? [...categoryMatch[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(item => textFromHtml(item[1])).filter(Boolean)
      : [];
    const title = titleAnchor ? textFromHtml(titleAnchor[2]) : "";
    const name = companyMatch ? textFromHtml(companyMatch[1]) : "";
    if (!title || !name || !jobPattern.test(title) || !relevantCategoryPattern.test(categories.join(" ")) || !locationPattern.test(locationText)) continue;
    let jobUrl = "";
    try { jobUrl = new URL(decode(titleAnchor[1]), pageUrl).href; } catch {}
    if (!jobUrl) continue;
    const time = card.match(/<time\b[^>]*dateTime="([^"]+)"/i)?.[1] || "";
    jobs.push({
      name,
      title,
      listingLocation: locationText,
      category: categories[0] || "",
      level: categories[1] || "",
      employmentType: categories[2] || "",
      directoryJobUrl: jobUrl,
      directorySourceUrl: pageUrl,
      directoryPostedAt: time,
      queryLane: "Globally Remote Jobs Costa Rica listings — official employer link pending",
    });
  }
  return jobs;
}

async function mapPool(items, concurrency, worker) {
  const results = Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await worker(items[index]); }
      catch (error) { results[index] = { error: error instanceof Error ? error.message : String(error) }; }
    }
  }));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/fetch-globallyremote-company-leads.mjs [--concurrency 12] [--out leads.json]");
    console.log("Fetches the Costa Rica remote-job index in parallel and emits one name-only lead per relevant engineering employer. Dedupe those names before resolving official job links and websites.");
    return;
  }

  const firstHtml = await fetchHtml(baseUrl);
  const listingTotal = countFromPage(firstHtml);
  const firstPageJobs = parsePage(firstHtml, baseUrl);
  const cardCount = [...firstHtml.matchAll(/<article\b[\s\S]*?<\/article>/gi)].length;
  const pageCount = Math.max(1, Math.ceil((listingTotal || cardCount) / Math.max(1, cardCount)));
  const pageUrls = Array.from({ length: pageCount - 1 }, (_, index) => `${baseUrl}?page=${index + 2}`);
  const pageResults = await mapPool(pageUrls, options.concurrency, async pageUrl => ({ pageUrl, html: await fetchHtml(pageUrl) }));
  const errors = pageResults.filter(result => result.error);
  const jobs = [...firstPageJobs];
  for (const result of pageResults) if (result.html) jobs.push(...parsePage(result.html, result.pageUrl));

  const byEmployer = new Map();
  for (const job of jobs) {
    const key = normalized(job.name);
    const existing = byEmployer.get(key);
    if (!existing) byEmployer.set(key, { ...job, directoryJobUrls: [job.directoryJobUrl], sourceJobCount: 1 });
    else {
      existing.sourceJobCount += 1;
      if (!existing.directoryJobUrls.includes(job.directoryJobUrl)) existing.directoryJobUrls.push(job.directoryJobUrl);
    }
  }

  const candidates = [...byEmployer.values()].map(candidate => ({
    ...candidate,
    directoryJobUrls: candidate.directoryJobUrls || [candidate.directoryJobUrl],
    sourceUrl: candidate.directorySourceUrl,
  }));
  const outPath = path.resolve(root, options.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({
    cohortId: "likes-based-2026-11-07-p008",
    generatedOn: getCostaRicaDate(),
    discoveryOnly: true,
    source: baseUrl,
    sourceListingCount: listingTotal,
    sourcePageCount: pageCount,
    sourceJobCount: jobs.length,
    relevantJobCount: jobs.length,
    uniqueEmployerCount: candidates.length,
    fetchErrors: errors,
    candidates,
  }, null, 2)}\n`, "utf8");
  console.log(`Fetched ${pageCount} Costa Rica-index pages (${listingTotal || cardCount} listed roles); ${jobs.length} software/engineering roles met the explicit Costa Rica/LATAM location screen across ${candidates.length} employers.`);
  if (errors.length) console.log(`${errors.length} page fetches failed and are recorded in the output.`);
  console.log(`Wrote ${path.relative(root, outPath)}. These are name-only leads; dedupe before opening official postings.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
