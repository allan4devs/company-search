#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nonCompanyHost = /(^|\.)(enterpriseleague\.com|linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|vimeo\.com|crunchbase\.com|clutch\.co|sortlist\.com|wikipedia\.org)$/i;

function parseArgs(args) {
  const options = { concurrency: 10, out: "" };
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
    if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    if (options.input) throw new Error("Only one input file is allowed.");
    options.input = arg;
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 20) throw new Error("--concurrency must be between 1 and 20.");
  return options;
}

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? "")]));
}

function officialWebsite(html) {
  for (const match of html.matchAll(/<a\b[^>]*data-automation-id="website-url"[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    try {
      const url = new URL(attrs.href || "");
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || nonCompanyHost.test(url.hostname)) continue;
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {}
  }
  return "";
}

async function fetchProfile(candidate) {
  if (!candidate.profileUrl) return { ...candidate, profileFetchStatus: "missing directory profile URL" };
  try {
    const response = await fetch(candidate.profileUrl, {
      redirect: "follow", signal: AbortSignal.timeout(12000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = (await response.text()).slice(0, 3_000_000);
    const website = officialWebsite(html);
    return {
      ...candidate,
      ...(website ? { website, domain: new URL(website).hostname.replace(/^www\./i, "") } : {}),
      profileFetchStatus: response.status,
      ...(website ? {} : { profileFetchNote: "profile does not expose an unambiguous company website" }),
    };
  } catch (error) {
    return { ...candidate, profileFetchStatus: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input) {
    console.log("Usage: node scripts/resolve-enterprise-league-profiles.mjs <name-deduped-leads.json> [--concurrency 10] [--out leads-with-websites.json]");
    console.log("Fetches only surviving directory profiles and extracts an external website URL; verify it on first-party pages before import.");
    if (!options.help) process.exitCode = 2;
    return;
  }
  const inputPath = path.resolve(root, options.input);
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const candidates = Array.isArray(input) ? input : input.candidates || input.leads || input.companies || [];
  if (!candidates.length) throw new Error("Input contains no company candidates.");
  const output = Array(candidates.length);
  let cursor = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: Math.min(options.concurrency, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      output[index] = await fetchProfile(candidates[index]);
      completed += 1;
      if (completed % 25 === 0 || completed === candidates.length) console.log(`Resolved company profiles ${completed}/${candidates.length}.`);
    }
  }));
  const outPath = path.resolve(root, options.out || inputPath.replace(/\.json$/i, "-profiles-resolved.json"));
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({
    cohortId: input.cohortId || input.batchId || path.basename(inputPath, ".json"), generatedOn: getCostaRicaDate(),
    sourceInput: path.relative(root, inputPath), inputCandidateCount: candidates.length,
    websiteCandidateCount: output.filter(candidate => candidate.website).length,
    candidates: output,
  }, null, 2)}\n`, "utf8");
  console.log(`Resolved ${output.filter(candidate => candidate.website).length} of ${candidates.length} surviving profiles to a website candidate.`);
  console.log(`Wrote ${path.relative(root, outPath)}; official-site fit and location checks still required.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
