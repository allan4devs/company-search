#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blockedHost = /(^|\.)(?:alpunto\.cr|facebook\.com|instagram\.com|linkedin\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|wa\.me|whatsapp\.com|google\.com|waze\.com)$/i;
function decode(value) { return String(value || "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#x([\da-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16))); }
function siteFrom(html) {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const raw = decode(match[1]);
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || blockedHost.test(host)) continue;
      if (/^(?:maps|www\.google|api|cdn|static)\./i.test(host)) continue;
      if (url.pathname.match(/\.(?:png|jpg|jpeg|svg|webp|pdf)$/i)) continue;
      url.search = ""; url.hash = "";
      return url.href;
    } catch {}
  }
  return "";
}

async function main() {
  const args = process.argv.slice(2);
  const input = args.find(arg => !arg.startsWith("--"));
  const outIndex = args.indexOf("--out"); const out = outIndex >= 0 ? args[outIndex + 1] : "company-batches/p007-alpunto-profiles-resolved.json";
  const concurrencyIndex = args.indexOf("--concurrency"); const concurrency = concurrencyIndex >= 0 ? Number(args[concurrencyIndex + 1]) : 16;
  if (!input) throw new Error("Usage: node scripts/resolve-alpunto-profiles.mjs <name-survivors.json> [--concurrency 16] [--out resolved.json]");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 30) throw new Error("--concurrency must be between 1 and 30.");
  const inputPath = path.resolve(root, input);
  const source = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const candidates = source.candidates || source;
  const output = Array(candidates.length);
  let cursor = 0; let completed = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      const candidate = candidates[index];
      try {
        const response = await fetch(candidate.profileUrl, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = (await response.text()).slice(0, 1_500_000);
        const website = siteFrom(html);
        output[index] = { ...candidate, ...(website ? { website, domain: new URL(website).hostname.replace(/^www\./i, "") } : {}), profileFetchStatus: response.status, ...(website ? {} : { profileFetchNote: "No external company website was exposed by the directory profile." }) };
      } catch (error) { output[index] = { ...candidate, profileFetchStatus: error instanceof Error ? error.message : String(error) }; }
      completed += 1;
      if (completed % 25 === 0 || completed === candidates.length) console.log(`Resolved Alpunto company profiles ${completed}/${candidates.length}.`);
    }
  }));
  const outPath = path.resolve(root, out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ cohortId: source.cohortId || "likes-based-2026-11-07-p007", generatedOn: getCostaRicaDate(), sourceInput: path.relative(root, inputPath), inputCandidateCount: candidates.length, websiteCandidateCount: output.filter(item => item.website).length, candidates: output }, null, 2)}\n`, "utf8");
  console.log(`Resolved ${output.filter(item => item.website).length} of ${candidates.length} survivors to a website candidate; first-party website and fit checks remain required.`);
  console.log(`Wrote ${path.relative(root, outPath)}.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
