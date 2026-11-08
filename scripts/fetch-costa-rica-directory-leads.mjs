#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = {
  guiatic: "https://guiatic.com/cr/directorio",
  camscat: "https://www.camscat.org/directorio-empresas/",
};

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function visibleText(value) {
  return decode(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? "")]));
}

function linksFrom(html, pageUrl) {
  return [...String(html || "").matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].flatMap(match => {
    const open = match[0].slice(0, match[0].indexOf(">") + 1);
    const linkAttrs = attrs(open);
    if (!linkAttrs.href) return [];
    try {
      const url = new URL(linkAttrs.href, pageUrl);
      if (!/^https?:$/.test(url.protocol)) return [];
      return [{ url: url.href, label: visibleText(match[0]) }];
    } catch { return []; }
  });
}

async function fetchHtml(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        headers: { "user-agent": "CompanyDirectoryResearchBot/1.0 (+public company discovery)", accept: "text/html,application/xhtml+xml" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = (await response.text()).slice(0, 2_000_000);
      return { url: response.url, html };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError;
}

function parseGuiaticList(html, sourceUrl) {
  const rows = [];
  const seen = new Set();
  for (const match of String(html || "").matchAll(/<a\b[^>]*href="([^"]*\/cr\/directorio\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let profileUrl;
    try { profileUrl = new URL(decode(match[1]), sourceUrl).href; } catch { continue; }
    if (profileUrl === sourceUrl || seen.has(profileUrl)) continue;
    const name = visibleText(match[2]);
    if (!name || name.length > 120) continue;
    seen.add(profileUrl);
    rows.push({ name, profileUrl, directoryProfileUrl: profileUrl, queryLane: "Guía TIC Costa Rica technology supplier directory", sourceUrl });
  }
  return rows;
}

function parseCamscat(html, sourceUrl) {
  const rows = [];
  for (const match of String(html || "").matchAll(/<img\b[^>]*title="([^"]+)"[^>]*>/gi)) {
    const name = decode(match[1]).trim();
    if (!name || name.length > 120) continue;
    const tail = String(html).slice(match.index, Math.min(String(html).length, match.index + 14000));
    const website = tail.match(/data-name="entity_field_field_website"[\s\S]{0,1400}?href="([^"]+)"/i)?.[1];
    if (!website) continue;
    try {
      rows.push({
        name,
        website: new URL(decode(website), sourceUrl).href,
        queryLane: "CamSCAT Costa Rica shared-services member directory",
        sourceUrl,
      });
    } catch {}
  }
  return rows;
}

async function enrichGuiaticProfile(candidate) {
  try {
    const { url, html } = await fetchHtml(candidate.profileUrl);
    const links = linksFrom(html, url);
    const website = links.find(link => /^(sitio web|website|página web)$/i.test(link.label))
      || links.find(link => /\bwebsite\b|sitio web/i.test(link.label));
    return {
      ...candidate,
      ...(website ? { website: website.url, domain: new URL(website.url).hostname } : {}),
      directoryTitle: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim(),
      profileFetchStatus: 200,
    };
  } catch (error) {
    return { ...candidate, profileFetchStatus: error instanceof Error ? error.message : String(error) };
  }
}

async function mapLimit(items, limit, callback) {
  const output = Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await callback(items[index]);
    }
  }));
  return output;
}

async function main() {
  const options = { concurrency: 12, out: "company-batches/costa-rica-directory-leads-2026-11-06.json", sources: ["guiatic", "camscat"] };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--out", "--concurrency", "--sources"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--out") options.out = value;
      if (arg === "--concurrency") options.concurrency = Number(value);
      if (arg === "--sources") options.sources = value.split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/fetch-costa-rica-directory-leads.mjs [--sources guiatic,camscat] [--concurrency 12] [--out leads.json]");
      return;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 24) throw new Error("--concurrency must be between 1 and 24.");

  const raw = [];
  for (const source of options.sources) {
    const url = sources[source];
    if (!url) throw new Error(`Unknown source: ${source}`);
    const { url: pageUrl, html } = await fetchHtml(url);
    raw.push(...(source === "guiatic" ? parseGuiaticList(html, pageUrl) : parseCamscat(html, pageUrl)));
  }
  const guiatic = raw.filter(candidate => candidate.queryLane.startsWith("Guía TIC"));
  const enrichedGuiatic = await mapLimit(guiatic, options.concurrency, enrichGuiaticProfile);
  const outputRows = [...enrichedGuiatic, ...raw.filter(candidate => candidate.queryLane.startsWith("CamSCAT"))];
  const outPath = path.resolve(root, options.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ generatedOn: getCostaRicaDate(), sources: options.sources.map(source => sources[source]), count: outputRows.length, candidates: outputRows }, null, 2)}\n`, "utf8");
  const withWebsite = outputRows.filter(candidate => candidate.website).length;
  console.log(`Collected ${outputRows.length} company leads in ${options.sources.length} directory lane(s); ${withWebsite} have a candidate website after bulk profile resolution.`);
  console.log(`Wrote ${path.relative(root, outPath)}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
