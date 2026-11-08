#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "https://www.camtic.org/directorio-de-afiliados/";

function parseArgs(args) {
  const options = { out: `company-batches/camtic-member-leads-${getCostaRicaDate()}.json`, pages: 5, concurrency: 3 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (["--out", "--pages", "--concurrency", "--enrich"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--out") options.out = value;
      else if (arg === "--enrich") options.enrich = value;
      else options[arg.slice(2)] = Number(value);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.pages) || options.pages < 1 || options.pages > 5) throw new Error("--pages must be between 1 and 5.");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 6) throw new Error("--concurrency must be between 1 and 6 for this directory host.");
  return options;
}

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function htmlText(value) {
  return decode(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

async function get(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
        headers: { "user-agent": "CompanyDirectoryResearchBot/1.0 (+public company discovery)", accept: "text/html,application/xhtml+xml" },
      });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} at ${url}`);
        if (![429, 500, 502, 503, 508].includes(response.status)) throw lastError;
      } else return { html: await response.text(), finalUrl: response.url };
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw lastError;
}

function parseMemberAnchors(html, pageUrl) {
  const members = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']*\/project\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const profileUrl = new URL(decode(match[1]), pageUrl).href;
    const name = htmlText(match[2]);
    if (name) members.push({ name, profileUrl });
  }
  return members;
}

function parseOfficialWebsite(html, profileUrl) {
  const host = new URL(profileUrl).hostname.toLowerCase().replace(/^www\./, "");
  const candidates = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decode(match[1]));
      const targetHost = url.hostname.toLowerCase().replace(/^www\./, "");
      if (targetHost === host || /(^|\.)(facebook|instagram|linkedin|youtube|wa\.me|x)\.com$/.test(targetHost)) continue;
      if (/google\.|g\.page$|maps\./.test(targetHost)) continue;
      candidates.push({ url: `${url.protocol}//${url.host}/`, label: htmlText(match[2]) });
    } catch {}
  }
  return candidates[0]?.url || "";
}

async function mapPool(items, concurrency, worker) {
  const results = Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await worker(items[index]); }
      catch (error) { results[index] = { ...items[index], fetchError: error instanceof Error ? error.message : String(error) }; }
    }
  }));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/fetch-camtic-company-leads.mjs [--pages 5] [--out name-leads.json]");
    console.log("       node scripts/fetch-camtic-company-leads.mjs --enrich unique-name-leads.json [--concurrency 3] [--out resolved-leads.json]");
    console.log("Harvest member names first, dedupe locally, then resolve profile and official website links only for unique survivors.");
    return;
  }

  let members;
  if (options.enrich) {
    const inputPath = path.resolve(root, options.enrich);
    const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
    members = (Array.isArray(input) ? input : input.candidates || input.leads || input.companies || [])
      .filter(candidate => candidate?.name && (candidate?.directoryProfileUrl || candidate?.profileUrl))
      .map(candidate => ({ ...candidate, directoryProfileUrl: candidate.directoryProfileUrl || candidate.profileUrl, profileUrl: candidate.directoryProfileUrl || candidate.profileUrl }));
  } else {
    const pages = await Promise.all(Array.from({ length: options.pages }, async (_, index) => {
      const pageUrl = index === 0 ? base : new URL(`page/${index + 1}/`, base).href;
      const { html } = await get(pageUrl);
      return parseMemberAnchors(html, pageUrl);
    }));
    const seenProfiles = new Set();
    members = pages.flat().filter(member => {
      if (seenProfiles.has(member.profileUrl)) return false;
      seenProfiles.add(member.profileUrl);
      return true;
    });
  }

  const candidates = options.enrich
    ? await mapPool(members, options.concurrency, async member => {
        const { html } = await get(member.profileUrl);
        const body = htmlText(html);
        const descriptionStart = body.indexOf("Datos de la empresa");
        const resolved = {
          ...member,
          website: parseOfficialWebsite(html, member.profileUrl),
          sourceUrl: member.profileUrl,
          queryLane: member.queryLane || "CAMTIC Costa Rica ICT member directory",
          directoryDescription: body.slice(Math.max(0, descriptionStart - 900), descriptionStart > 0 ? descriptionStart : 900),
          directoryLocationText: (() => {
            const match = body.match(/.{0,80}(?:Costa Rica|San José|San Jose|Heredia|Alajuela|Cartago).{0,100}/i);
            return match?.[0] || "";
          })(),
        };
        delete resolved.fetchError;
        return resolved;
      })
    : members.map(member => ({ ...member, queryLane: "CAMTIC Costa Rica ICT member directory", sourceUrl: member.profileUrl }));

  const outPath = path.resolve(root, options.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ cohortId: `camtic-cr-${getCostaRicaDate()}`, generatedOn: getCostaRicaDate(), discoveryOnly: true, source: base, memberCount: candidates.length, candidates }, null, 2)}\n`, "utf8");
  const withWebsite = candidates.filter(candidate => candidate.website).length;
  const failed = candidates.filter(candidate => candidate.fetchError).length;
  console.log(options.enrich
    ? `Resolved ${candidates.length} unique CAMTIC member profiles (${withWebsite} with an external website; ${failed} profile fetch failures).`
    : `Collected ${candidates.length} CAMTIC member names; no profiles fetched before dedupe.`);
  console.log(`Wrote ${path.relative(root, outPath)}; these are leads, not verified import records.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
