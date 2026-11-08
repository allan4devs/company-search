#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = "https://jobicy.com/api/jobs";
const industries = ["engineering", "admin", "data-science", "cybersecurity", "qa-testing", "technical-support"];
const rolePattern = /software|engineer|developer|devops|sre|data engineer|data architect|security engineer|qa engineer|quality engineer|test engineer|platform engineer|backend|front.?end|full.?stack|programmer|automation engineer/i;
const locationPattern = /\bLATAM\b|Latin America|Costa\s+Rica/i;
const checkedOn = getCostaRicaDate();

function clean(value) { return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }

function rootWebsite(html, companyName) {
  const matches = [];
  for (const match of String(html || "").matchAll(/<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1] || match[2]);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!/^https?:$/.test(url.protocol) || /jobicy\.com$|facebook|instagram|linkedin|twitter|youtube|tiktok|google\./i.test(host)) continue;
      const label = clean(match[3]);
      const score = (label.toLowerCase().includes(companyName.toLowerCase()) ? 4 : 0)
        + (/^(https?:\/\/)?(www\.)?[^/]+\/?$/i.test(url.href) ? 2 : 0)
        + (url.protocol === "https:" ? 1 : 0);
      matches.push({ href: url.href, score });
    } catch {}
  }
  matches.sort((a, b) => b.score - a.score);
  if (!matches.length) return "";
  const url = new URL(matches[0].href);
  return `https://${url.hostname.toLowerCase().replace(/^www\./, "www.")}/`;
}

async function fetchJobs(industry) {
  const params = new URLSearchParams({ count: "200", geo: "latam", industry });
  const all = [];
  let page = 0;
  do {
    if (page > 0) params.set("cursor", fetchJobs.cursorByIndustry.get(industry));
    const response = await fetch(`${api}?${params}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.error || `Jobicy HTTP ${response.status} for ${industry}`);
    all.push(...(data.jobs || []));
    const next = data.nextCursor || null;
    if (next) fetchJobs.cursorByIndustry.set(industry, next);
    page += 1;
    if (!next) break;
  } while (page < 10);
  return all;
}
fetchJobs.cursorByIndustry = new Map();

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : "company-batches/jobicy-latam-engineering-leads.json";
  const fetchedByIndustry = await Promise.all(industries.map(async industry => [industry, await fetchJobs(industry)]));
  const allJobs = new Map();
  for (const [industry, jobs] of fetchedByIndustry) {
    for (const job of jobs) if (job?.id && !allJobs.has(String(job.id))) allJobs.set(String(job.id), { ...job, queryLane: `Jobicy current LATAM engineering (${industry})` });
  }
  const eligibleJobs = [...allJobs.values()].filter(job => rolePattern.test(`${job.jobTitle || ""} ${(job.jobIndustry || []).join(" ")}`)
    && locationPattern.test(job.jobGeo || ""));
  const byEmployer = new Map();
  for (const job of eligibleJobs) {
    const name = clean(job.companyName);
    if (!name) continue;
    const key = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const current = byEmployer.get(key) || {
      name,
      website: rootWebsite(job.jobDescription, name),
      careersUrl: "",
      model: "unknown",
      tracks: ["Software Engineering"],
      locations: [],
      jobs: [],
      queryLane: job.queryLane,
      sourceUrl: "https://jobicy.com/jobs-rss-feed",
      leadSource: "Jobicy public remote-jobs API; use as a discovery lead and confirm employer details directly",
    };
    const location = clean(job.jobGeo);
    current.locations = [...new Set([...current.locations, ...location.split(",").map(value => value.trim()).filter(value => locationPattern.test(value))])];
    current.jobs.push({
      id: `jobicy-${job.id}`,
      title: clean(job.jobTitle),
      location,
      eligibility: location,
      url: job.url,
      workMode: "Remote",
      listingStatus: "Current Jobicy listing; not yet confirmed on employer ATS",
      checkedOn,
      technologies: [...new Set((job.jobDescription || "").match(/JavaScript|TypeScript|React|Next\.js|Node\.js|Java|Spring|Python|Go|Golang|Kotlin|Ruby|\.NET|AWS|Azure|GCP/gi) || [])],
      roles: ["Engineering"],
      levels: [],
    });
    byEmployer.set(key, current);
  }
  const candidates = [...byEmployer.values()];
  const outPath = path.resolve(root, out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ cohortId: `jobicy-latam-${checkedOn}`, generatedOn: checkedOn, discoveryOnly: true, fetchedJobCount: allJobs.size, regionalEngineeringPostCount: eligibleJobs.length, employerLeadCount: candidates.length, queryStats: fetchedByIndustry.map(([industry, jobs]) => ({ industry, jobs: jobs.length })), candidates }, null, 2)}\n`, "utf8");
  console.log(`Read ${allJobs.size} current Jobicy listings, kept ${eligibleJobs.length} explicit LATAM/Costa Rica engineering posts, and grouped them into ${candidates.length} employers.`);
  console.log(`Wrote ${path.relative(root, outPath)}; Jobicy is a lead source, so confirm eligibility and careers details on first-party pages before import.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
