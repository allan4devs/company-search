#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const categoryUrl = "https://nearshore.cr/business-directory/wpbdp_category/technology-it-services/";
const directoryHost = "nearshore.cr";
const socialHost = /(?:facebook|instagram|linkedin|youtube|twitter|x\.com|tiktok|maps\.google|wa\.me|whatsapp)\./i;

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#038;/g, "&");
}

function clean(value) { return decode(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }

async function getHtml(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return { url: response.url, html: await response.text() };
}

function listingLinks(html, sourceUrl) {
  const rows = [];
  const listings = [...html.matchAll(/<div id="wpbdp-listing-\d+"[\s\S]*?<div class="listing-title">[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/div>/gi)];
  for (const match of listings) {
    const profileUrl = decode(match[1]);
    const name = clean(match[2]);
    if (!name || !/^https?:\/\//i.test(profileUrl)) continue;
    rows.push({ name, profileUrl, sourceUrl, queryLane: "Nearshore Costa Rica Technology & IT Services directory" });
  }
  return rows;
}

function externalSite(html, profileUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi)) {
    const raw = decode(match[1] || match[2]);
    try {
      const url = new URL(raw, profileUrl);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!/^https?:$/.test(url.protocol) || host === directoryHost || host.endsWith(`.${directoryHost}`) || socialHost.test(host)) continue;
      links.push({ url: url.href, label: clean(match[3]) });
    } catch {}
  }
  return links.find(link => /website|visit|www\.|company|official|home|site|visit our/i.test(`${link.label} ${link.url}`))?.url || links[0]?.url || "";
}

async function mapLimit(rows, limit, fn) {
  const output = Array(rows.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      try { output[index] = await fn(rows[index]); }
      catch (error) { output[index] = { ...rows[index], profileError: error instanceof Error ? error.message : String(error) }; }
    }
  }));
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : "company-batches/nearshore-cr-it-leads.json";
  const pages = [categoryUrl, `${categoryUrl}page/2/`];
  const pageResults = await Promise.all(pages.map(getHtml));
  const byName = new Map(pageResults.flatMap(page => listingLinks(page.html, page.url)).map(row => [row.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""), row]));
  const listings = [...byName.values()];
  const candidates = await mapLimit(listings, 12, async row => {
    const { html } = await getHtml(row.profileUrl);
    return { ...row, website: externalSite(html, row.profileUrl) };
  });
  const outputPath = path.resolve(root, out);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({ cohortId: `nearshore-cr-${getCostaRicaDate()}`, generatedOn: getCostaRicaDate(), discoveryOnly: true, source: "Nearshore Costa Rica Technology & IT Services directory; verify fit and Costa Rica presence on the employer's own site", candidateCount: candidates.length, candidates }, null, 2)}\n`, "utf8");
  console.log(`Collected ${candidates.length} directory company leads; ${candidates.filter(row => row.website).length} profiles exposed an external site link.`);
  console.log(`Wrote ${path.relative(root, outputPath)}; directory evidence is discovery-only.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
