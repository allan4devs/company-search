#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directoryHosts = new Set(["proveedoresdecostarica.com", "proveedoresdeamerica.com"]);
const excludedHosts = /(^|\.)(?:facebook|instagram|linkedin|x|twitter|youtube|tiktok|vimeo|clutch|sortlist|wikipedia|google|maps\.google)\./i;

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function getOfficialUrl(html) {
  const urls = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(decode(m[1]));
      const visit = value => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { for (const child of value) visit(child); return; }
        if (Array.isArray(value.sameAs)) urls.push(...value.sameAs);
        else if (typeof value.sameAs === "string") urls.push(value.sameAs);
        for (const child of Object.values(value)) if (child && typeof child === "object") visit(child);
      };
      visit(data);
    } catch {}
  }
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) urls.push(decode(m[1]));
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || excludedHosts.test(host)) continue;
      if ([...directoryHosts].some(d => host === d || host.endsWith(`.${d}`))) continue;
      if (/^(?:accounts|api|cdn|static)\./i.test(host)) continue;
      url.search = ""; url.hash = "";
      return url.href;
    } catch {}
  }
  return "";
}

async function main() {
  const args = process.argv.slice(2);
  const inputArg = args.find(arg => !arg.startsWith("--"));
  const concurrencyIndex = args.indexOf("--concurrency");
  const outIndex = args.indexOf("--out");
  const concurrency = concurrencyIndex >= 0 ? Number(args[concurrencyIndex + 1]) : 16;
  const out = outIndex >= 0 ? args[outIndex + 1] : "company-batches/p007-proveedores-profiles-resolved.json";
  if (!inputArg) throw new Error("Usage: node scripts/resolve-proveedores-profiles.mjs <name-survivors.json> [--concurrency 16] [--out resolved.json]");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 30) throw new Error("--concurrency must be between 1 and 30.");
  const inputPath = path.resolve(root, inputArg);
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const candidates = (input.candidates || input).filter(item => String(item.queryLane || "").includes("Proveedores de Costa Rica"));
  const output = Array(candidates.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      const candidate = candidates[index];
      try {
        const response = await fetch(candidate.profileUrl, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = (await response.text()).slice(0, 1_000_000);
        const website = getOfficialUrl(html);
        output[index] = { ...candidate, ...(website ? { website, domain: new URL(website).hostname.replace(/^www\./i, "") } : {}), profileFetchStatus: response.status, ...(website ? {} : { profileFetchNote: "no official website exposed by directory profile" }) };
      } catch (error) { output[index] = { ...candidate, profileFetchStatus: error instanceof Error ? error.message : String(error) }; }
      if ((index + 1) % 50 === 0 || index + 1 === candidates.length) console.log(`Resolved directory profiles ${index + 1}/${candidates.length}.`);
    }
  }));
  const outPath = path.resolve(root, out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ cohortId: input.cohortId || "likes-based-2026-11-07-p007", generatedOn: getCostaRicaDate(), sourceInput: path.relative(root, inputPath), inputCandidateCount: candidates.length, websiteCandidateCount: output.filter(item => item.website).length, candidates: output }, null, 2)}\n`, "utf8");
  console.log(`Resolved ${output.filter(item => item.website).length} of ${candidates.length} supplier profiles to an official site candidate.`);
  console.log(`Wrote ${path.relative(root, outPath)}; the directory is a lead source, so full official-site checks and full dedupe remain required.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
