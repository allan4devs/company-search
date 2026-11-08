#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feedUrl = "https://findremote.jobs/feeds/roles/software-engineering/locations/latin-america.json";

function clean(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function employerFrom(item) {
  const title = clean(item.title);
  const explicit = title.match(/\s+at\s+(.+)$/i);
  if (explicit?.[1]) return explicit[1].trim();
  const companyLink = String(item.content_html || "").match(/https?:\/\/himalayas\.app\/companies\/([^"'/?#]+)/i);
  if (companyLink?.[1]) return companyLink[1].replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
  return "";
}

function jobTitle(title, company) {
  const value = clean(title);
  const suffix = new RegExp(`\\s+at\\s+${company.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`, "i");
  return value.replace(suffix, "").trim() || value;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const output = outIndex >= 0 ? args[outIndex + 1] : "company-batches/findremote-latam-engineering-leads.json";
  const response = await fetch(feedUrl, {
    headers: { accept: "application/feed+json, application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Find Remote feed HTTP ${response.status}`);
  const feed = await response.json();
  const byName = new Map();
  for (const item of feed.items || []) {
    const name = employerFrom(item);
    if (!name) continue;
    const key = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const current = byName.get(key) || {
      name,
      queryLane: "Find Remote Jobs current software-engineering LATAM feed",
      sourceUrl: item.url,
      sourceFeedUrl: feedUrl,
      leadOnly: true,
      roles: [],
    };
    current.roles.push({ title: jobTitle(item.title, name), sourceUrl: item.url, publishedOn: item.date_published || null });
    byName.set(key, current);
  }
  const candidates = [...byName.values()].map(candidate => ({ ...candidate, roles: candidate.roles.slice(0, 8) }));
  const outputPath = path.resolve(root, output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    cohortId: `findremote-latam-${getCostaRicaDate()}`,
    generatedOn: getCostaRicaDate(),
    discoveryOnly: true,
    sourceFeedUrl: feedUrl,
    listingCount: (feed.items || []).length,
    employerLeadCount: candidates.length,
    candidates,
  }, null, 2)}\n`, "utf8");
  console.log(`Grouped ${(feed.items || []).length} current software-engineering listings into ${candidates.length} employer leads.`);
  console.log(`Wrote ${path.relative(root, outputPath)}. Feed names are discovery leads only; confirm employer identity, engineering fit, and location on first-party pages.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
