#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blockedHosts = /(^|\.)(alpunto\.cr|guiatic\.com|camtic\.org|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|wa\.me|whatsapp\.com|google\.[a-z.]+|g\.page|waze\.com|duckduckgo\.com|bing\.com)$/i;

function parseArgs(args) {
  const options = { concurrency: 24, out: "" };
  for (let i = 0; i < args.length; i += 1) {
    if (["--out", "--concurrency"].includes(args[i])) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${args[i - 1]} requires a value.`);
      options[args[i - 1].slice(2)] = args[i - 1] === "--out" ? value : Number(value);
    } else if (!args[i].startsWith("--") && !options.input) options.input = args[i];
    else throw new Error(`Unexpected argument: ${args[i]}`);
  }
  if (!options.input) throw new Error("Usage: node scripts/resolve-directory-profiles.mjs <unique-leads.json> [--concurrency 24] [--out resolved.json]");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 40) throw new Error("--concurrency must be between 1 and 40.");
  return options;
}

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function profileLinks(html, profileUrl) {
  const found = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const raw = decode(match[1]);
    const label = decode(match[2].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    try {
      const url = new URL(raw, profileUrl);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || blockedHosts.test(host)) continue;
      if (/^(mailto:|tel:)/i.test(raw) || /\.(?:png|jpe?g|svg|webp|pdf)(?:$|\?)/i.test(url.pathname)) continue;
      if (/^(?:maps|static|cdn|api)\./i.test(host) || url.origin === new URL(profileUrl).origin) continue;
      url.search = ""; url.hash = "";
      const key = url.origin;
      const prior = found.get(key);
      const score = /website|sitio web|p[aá]gina web|web|visit|official/i.test(label) ? 1 : 0;
      if (!prior || score > prior.score) found.set(key, { url: url.href, domain: host, label, score });
    } catch {}
  }
  return [...found.values()].sort((a, b) => b.score - a.score);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(root, options.input);
  const source = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const candidates = Array.isArray(source) ? source : source.candidates || source.leads || [];
  const output = Array(candidates.length);
  let cursor = 0; let completed = 0;
  await Promise.all(Array.from({ length: Math.min(options.concurrency, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      const candidate = candidates[index];
      try {
        const profileUrl = candidate.profileUrl || candidate.directoryProfileUrl || candidate.sourceUrl;
        const response = await fetch(profileUrl, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = (await response.text()).slice(0, 1_500_000);
        const links = profileLinks(html, profileUrl);
        output[index] = { ...candidate, ...(links[0] ? { website: links[0].url, domain: links[0].domain } : {}), profileWebsiteCandidates: links.slice(0, 5), profileFetchStatus: response.status };
      } catch (error) {
        output[index] = { ...candidate, profileFetchStatus: error instanceof Error ? error.message : String(error) };
      }
      completed += 1;
      if (completed % 50 === 0 || completed === candidates.length) console.log(`Resolved directory profiles ${completed}/${candidates.length}.`);
    }
  }));
  const outPath = path.resolve(root, options.out || inputPath.replace(/\.json$/i, "-profiles-resolved.json"));
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ cohortId: source.cohortId || path.basename(inputPath, ".json"), generatedOn: getCostaRicaDate(), sourceInput: path.relative(root, inputPath), inputCandidateCount: candidates.length, websiteCandidateCount: output.filter(item => item.website).length, candidates: output }, null, 2)}\n`, "utf8");
  console.log(`Found external website candidates for ${output.filter(item => item.website).length}/${candidates.length} directory profiles; first-party verification is still required.`);
  console.log(`Wrote ${path.relative(root, outPath)}.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
