#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = "https://himalayas.app/jobs/api/search";
const engineeringPattern = /software|engineer|developer|devops|sre|quality assurance|quality engineer|\bqa\b|data engineer|architect/i;
const defaultQueries = ["software engineer", "software developer", "full stack engineer", "backend engineer", "frontend engineer", "devops engineer", "data engineer"];

function usage() {
  console.log("Usage: node scripts/fetch-himalayas-company-leads.mjs [--out leads.json] [--max-leads 1000] [--queries \"software engineer,developer\"]");
  console.log("Fetches public Costa Rica-eligible remote engineering listings as leads, then groups roles by employer. Verify each employer on official sources before import.");
}

function parseArgs(args) {
  const options = { out: "company-batches/himalayas-cr-engineering-leads.json", maxLeads: 1000, queries: defaultQueries };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (["--out", "--max-leads", "--queries"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--out") options.out = value;
      if (arg === "--max-leads") options.maxLeads = Number(value);
      if (arg === "--queries") options.queries = value.split(",").map(item => item.trim()).filter(Boolean);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.maxLeads) || options.maxLeads < 1) throw new Error("--max-leads must be a positive integer.");
  if (!options.queries.length) throw new Error("Provide at least one search query.");
  return options;
}

function pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchPage(query, page) {
  const url = new URL(api);
  url.searchParams.set("country", "CR");
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(page));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.status === 429 || response.status === 503) {
      const retrySeconds = Number(response.headers.get("retry-after") || 2 ** attempt);
      await pause(Math.min(30, retrySeconds) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`Himalayas search returned HTTP ${response.status} for ${query} page ${page}.`);
    return response.json();
  }
  throw new Error(`Himalayas search kept rate-limiting query '${query}', page ${page}.`);
}

function locationFor(job) {
  const locations = Array.isArray(job.locationRestrictions) ? job.locationRestrictions : [];
  if (locations.some(location => String(location).toLowerCase() === "costa rica")) return "Costa Rica";
  const text = [job.title, job.excerpt, job.description].filter(Boolean).join(" ");
  if (/costa\s+rica/i.test(text)) return "Costa Rica";
  if (/\blatam\b/i.test(text)) return "LATAM";
  if (/latin america/i.test(text)) return "Latin America";
  return "";
}

function isExplicitlyIneligible(job) {
  const locations = Array.isArray(job.locationRestrictions) ? job.locationRestrictions : [];
  return locations.length > 0 && !locations.some(location => String(location).toLowerCase() === "costa rica");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { usage(); return; }

  const byEmployer = new Map();
  const seenJobs = new Set();
  const queryStats = [];

  for (const query of options.queries) {
    const first = await fetchPage(query, 1);
    const limit = Number(first.limit || 20);
    const totalPages = Math.max(1, Math.ceil(Number(first.totalCount || 0) / limit));
    let matched = 0;
    let pagesRead = 0;
    for (let page = 1; page <= totalPages && byEmployer.size < options.maxLeads; page += 1) {
      // Process the first page immediately, then stay under the public API's 60-request/minute limit.
      if (page > 1) await pause(1100);
      const payload = page === 1 ? first : await fetchPage(query, page);
      pagesRead += 1;
      for (const job of payload.jobs || []) {
        const jobKey = String(job.guid || job.applicationLink || `${job.companySlug}:${job.title}`);
        if (seenJobs.has(jobKey)) continue;
        seenJobs.add(jobKey);
        if (!job.companyName || !job.companySlug || !engineeringPattern.test([job.title, ...(job.categories || []), ...(job.parentCategories || [])].join(" "))) continue;
        if (isExplicitlyIneligible(job)) continue;
        const location = locationFor(job);
        if (!location) continue;

        const employerKey = String(job.companySlug).toLowerCase();
        const current = byEmployer.get(employerKey) || {
          name: String(job.companyName).trim(),
          aliases: [String(job.companySlug).trim()],
          companySlug: String(job.companySlug).trim(),
          companyPageUrl: `https://himalayas.app/companies/${encodeURIComponent(job.companySlug)}`,
          website: "",
          careersUrl: "",
          domain: "",
          locations: [location],
          model: "unknown",
          tracks: ["Software Engineering"],
          queryLane: `Himalayas CR-filtered: ${query}`,
          sourceUrl: job.applicationLink || job.guid || "",
          leadSource: "Himalayas public jobs API",
          sourceJobTitle: job.title,
          locationRestrictions: Array.isArray(job.locationRestrictions) ? job.locationRestrictions : [],
          leadEvidence: [],
        };
        current.locations = [...new Set([...(current.locations || []), location])];
        current.leadEvidence.push({ url: job.applicationLink || job.guid || "", location, checkedOn: getCostaRicaDate() });
        byEmployer.set(employerKey, current);
        matched += 1;
        if (byEmployer.size >= options.maxLeads) break;
      }
    }
    queryStats.push({ query, totalJobs: Number(first.totalCount || 0), pagesRead, newlyMatchedJobs: matched, uniqueEmployers: byEmployer.size });
    if (byEmployer.size >= options.maxLeads) break;
  }

  const candidates = [...byEmployer.values()];
  const outputPath = path.resolve(options.out);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    cohortId: `himalayas-cr-${getCostaRicaDate()}`,
    generatedOn: getCostaRicaDate(),
    discoveryOnly: true,
    fetchedUniqueJobRecords: seenJobs.size,
    matchingUniqueEmployerLeads: candidates.length,
    queryStats,
    candidates,
  }, null, 2)}\n`, "utf8");
  console.log(`Fetched ${seenJobs.size} distinct job listings and grouped them into ${candidates.length} company leads.`);
  console.log(`Wrote ${path.relative(root, outputPath)}; candidates are discovery leads and still need official-site verification.`);
  for (const stat of queryStats) console.log(`  ${stat.query}: ${stat.totalJobs} postings, ${stat.pagesRead} pages, ${stat.newlyMatchedJobs} location-qualified engineering leads`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
