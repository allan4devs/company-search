#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCacheFile = path.join(os.tmpdir(), "the-comp-domain-resolution-cache-v1.json");
const positiveCacheTtlMs = 180 * 24 * 60 * 60 * 1000;
const negativeCacheTtlMs = 14 * 24 * 60 * 60 * 1000;
const blockedHosts = /(^|\.)(duckduckgo\.com|google\.[a-z.]+|bing\.com|linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|crunchbase\.com|clutch\.co|sortlist\.com|wikipedia\.org|yelp\.[a-z.]+|proveedoresdecostarica\.com|cylex\.[a-z.]+|yellowpages\.[a-z.]+|findremote\.jobs|himalayas\.app|jobicy\.com|remoteok\.com|remotive\.com|wellfound\.com|glassdoor\.[a-z.]+|indeed\.com|builtin\.com)$/i;
const genericTokens = new Set(["sa", "sas", "srl", "inc", "llc", "ltd", "corp", "company", "co", "group", "the", "de", "del", "la", "el", "and", "y", "software", "technology", "technologies", "digital", "services", "service", "solutions", "solution", "development", "systems", "system", "consulting", "consultores", "cr", "costa", "rica"]);

function parseArgs(args) {
const options = { concurrency: 8, out: "", region: "Costa Rica", wikidataOnly: false, searchBudget: undefined, searchEngine: undefined, cacheFile: defaultCacheFile, useCache: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--wikidata-only") { options.wikidataOnly = true; continue; }
    if (arg === "--no-cache") { options.useCache = false; continue; }
    if (["--out", "--concurrency", "--region", "--search-budget", "--search-engine", "--cache-file"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--out") options.out = value;
      else if (arg === "--concurrency") options.concurrency = Number(value);
      else if (arg === "--region") options.region = value;
      else if (arg === "--search-budget") options.searchBudget = Number(value);
      else if (arg === "--search-engine") options.searchEngine = value.toLowerCase();
      else options.cacheFile = value;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    if (options.input) throw new Error("Only one input file is allowed.");
    options.input = arg;
  }
  options.searchEngine ||= options.searchBudget === undefined ? "both" : "bing";
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 20) throw new Error("--concurrency must be between 1 and 20.");
  if (options.searchBudget !== undefined && (!Number.isInteger(options.searchBudget) || options.searchBudget < 0 || options.searchBudget > 1000)) throw new Error("--search-budget must be between 0 and 1000.");
  if (!["both", "bing", "ddg"].includes(options.searchEngine)) throw new Error("--search-engine must be both, bing, or ddg.");
  return options;
}

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function plainText(value) { return decode(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? "")]));
}

function normalize(value) { return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function hasSiteCandidate(candidate) {
  return Boolean(candidate.website || candidate.domain || candidate.websiteCandidate || candidate.websiteCandidate?.url);
}

function tokensFor(name) {
  return normalize(name).split(/\s+/).filter(token => token.length > 2 && !genericTokens.has(token));
}

function candidateScore(name, title, url) {
  const tokens = tokensFor(name);
  const label = normalize(`${title} ${new URL(url).hostname.replace(/^www\./, "").replace(/\.[a-z]{2,}$/i, "")}`);
  const matches = tokens.filter(token => label.includes(token));
  if (!tokens.length) return 0;
  if (matches.length === tokens.length) return 3;
  if (matches.length >= 2) return 2;
  if (tokens.length === 1 && matches.length === 1) return 2;
  return 0;
}

function decodeSearchUrl(href) {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    if (url.hostname.endsWith("duckduckgo.com") && url.pathname === "/l/") return new URL(url.searchParams.get("uddg") || "");
    return url;
  } catch { return undefined; }
}

async function wikidataSitesFor(candidates) {
  const missing = [...new Set(candidates.filter(candidate => !hasSiteCandidate(candidate)).map(candidate => candidate.name).filter(Boolean))];
  if (!missing.length) return new Map();
  const byName = new Map();
  for (let offset = 0; offset < missing.length; offset += 180) {
    const names = missing.slice(offset, offset + 180);
    const values = names.map(name => `${JSON.stringify(name)}@en`).join(" ");
    const query = `SELECT ?label ?site WHERE { VALUES ?label { ${values} } ?item rdfs:label ?label; wdt:P856 ?site. FILTER (lang(?label) = "en") }`;
    const response = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: { accept: "application/sparql-results+json", "content-type": "application/x-www-form-urlencoded", "user-agent": "CompanyDirectoryResearchBot/1.0" },
      body: new URLSearchParams({ query, format: "json" }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Wikidata SPARQL HTTP ${response.status}`);
    const data = await response.json();
    for (const row of data.results?.bindings || []) {
      const nameKey = normalize(row.label?.value || "");
      const url = row.site?.value || "";
      try {
        const parsed = new URL(url);
        if (!/^https?:$/.test(parsed.protocol) || blockedHosts.test(parsed.hostname)) continue;
        const root = `${parsed.protocol}//${parsed.hostname.toLowerCase().replace(/^www\./, "")}/`;
        const sites = byName.get(nameKey) || new Map();
        sites.set(parsed.hostname.toLowerCase().replace(/^www\./, ""), root);
        byName.set(nameKey, sites);
      } catch {}
    }
  }
  return new Map([...byName].filter(([, sites]) => sites.size === 1).map(([name, sites]) => [name, [...sites.values()][0]]));
}

function linksFromSearch(html, engine) {
  const results = [];
  const pattern = engine === "bing"
    ? /<li\b[^>]*class="[^"]*b_algo[^"]*"[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    : /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    let href, title;
    if (engine === "bing") { href = decode(match[1]); title = plainText(match[2]); }
    else {
      const anchor = match[0];
      const attrs = attributes(anchor.slice(0, anchor.indexOf(">") + 1));
      href = attrs.href || "";
      title = plainText(anchor);
    }
    let url;
    if (engine === "bing") {
      try {
        const bingUrl = new URL(href, "https://www.bing.com");
        const encoded = bingUrl.searchParams.get("u");
        if (encoded?.startsWith("a1")) url = new URL(Buffer.from(encoded.slice(2), "base64url").toString("utf8"));
        else url = bingUrl;
      } catch {}
    } else url = decodeSearchUrl(href);
    if (!url || !/^https?:$/.test(url.protocol) || blockedHosts.test(url.hostname)) continue;
    results.push({ title, url: url.href });
  }
  return results;
}

async function searchPage(engine, query) {
  const searchUrl = engine === "bing"
    ? `https://www.bing.com/search?q=${encodeURIComponent(query)}`
    : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(searchUrl, {
    redirect: "follow", signal: AbortSignal.timeout(8000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; CompanyDirectoryResearchBot/1.0)", accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`Search HTTP ${response.status}`);
  return linksFromSearch(await response.text(), engine);
}

async function searchCandidate(candidate, region, searchEngineMode) {
  if (hasSiteCandidate(candidate)) return { ...candidate, domainResolutionStatus: "already has official website candidate" };
  const query = `"${candidate.name}" software engineering "${region}"`;
  const startedAt = performance.now();
  let requestCount = 0;
  let searchSource = "No search engine returned a name-matching candidate";
  const engineTimings = [];
  const engines = searchEngineMode === "both" ? ["ddg", "bing"] : [searchEngineMode];
  try {
    const results = [];
    for (const engine of engines) {
      const engineStartedAt = performance.now();
      let pageResultCount = 0;
      let matchingResultCount = 0;
      let engineError;
      try {
        requestCount += 1;
        const pageResults = await searchPage(engine, query);
        pageResultCount = pageResults.length;
        for (const result of pageResults) {
          const score = candidateScore(candidate.name, result.title, result.url);
          if (!score) continue;
          matchingResultCount += 1;
          const url = new URL(result.url);
          url.search = "";
          url.hash = "";
          results.push({ title: result.title, url: url.href, score, engine, query });
        }
      } catch (error) {
        engineError = error instanceof Error ? error.message : String(error);
      }
      engineTimings.push({ engine, elapsedMs: Math.round(performance.now() - engineStartedAt), pageResultCount, matchingResultCount, ...(engineError ? { error: engineError } : {}) });
      if (results.length) {
        searchSource = engine === "bing" && searchEngineMode === "both" ? "Bing HTML results after DuckDuckGo had no name-matching result" : `${engine === "bing" ? "Bing" : "DuckDuckGo"} HTML results`;
        break;
      }
      if (engineError && engine === engines.at(-1)) throw new Error(engineError);
    }
    results.sort((a, b) => b.score - a.score);
    const best = results[0];
    return {
      ...candidate,
      ...(best ? { websiteCandidate: best.url } : {}),
      domainResolutionStatus: best ? "search candidate; requires first-party verification" : "no name-matching official-site candidate found",
      domainSearch: { source: searchSource, checkedOn: getCostaRicaDate(), candidates: results.slice(0, 4), requestCount, engineTimings, elapsedMs: Math.round(performance.now() - startedAt) },
    };
  } catch (error) {
    return {
      ...candidate,
      domainResolutionStatus: error instanceof Error ? error.message : String(error),
      domainSearch: { source: searchSource, checkedOn: getCostaRicaDate(), candidates: [], requestCount, engineTimings, elapsedMs: Math.round(performance.now() - startedAt) },
    };
  }
}

function cacheKey(candidate, region) {
  return `${normalize(candidate.name)}\u001f${normalize(region)}`;
}

async function readDomainCache(cacheFile) {
  try {
    const document = JSON.parse(await fs.readFile(cacheFile, "utf8"));
    return new Map(Object.entries(document.entries || {}));
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    console.log(`Domain cache skipped: ${error instanceof Error ? error.message : String(error)}.`);
    return new Map();
  }
}

function isFreshCacheEntry(entry, now = Date.now()) {
  if (!entry || !Number.isFinite(Date.parse(entry.checkedAt))) return false;
  const age = now - Date.parse(entry.checkedAt);
  const ttl = entry.kind === "candidate" ? positiveCacheTtlMs : entry.kind === "no-match" ? negativeCacheTtlMs : 0;
  return ttl > 0 && age >= 0 && age < ttl;
}

function cacheEntryFor(candidate, checkedAt = new Date().toISOString()) {
  if (candidate.websiteCandidate || candidate.website || candidate.domain) {
    return {
      kind: "candidate",
      checkedAt,
      result: {
        ...(candidate.websiteCandidate ? { websiteCandidate: candidate.websiteCandidate } : {}),
        ...(candidate.website ? { website: candidate.website } : {}),
        ...(candidate.domain ? { domain: candidate.domain } : {}),
        ...(candidate.websiteResolutionSource ? { websiteResolutionSource: candidate.websiteResolutionSource } : {}),
        ...(candidate.domainResolutionStatus ? { domainResolutionStatus: candidate.domainResolutionStatus } : {}),
        ...(candidate.domainSearch ? { domainSearch: candidate.domainSearch } : {}),
      },
    };
  }
  if (candidate.domainResolutionStatus === "no name-matching official-site candidate found") {
    return {
      kind: "no-match",
      checkedAt,
      result: {
        domainResolutionStatus: candidate.domainResolutionStatus,
        ...(candidate.domainSearch ? { domainSearch: candidate.domainSearch } : {}),
      },
    };
  }
  return undefined;
}

function preferencePriority(candidate, preferenceContrast) {
  if (!preferenceContrast) return 0;
  const jobTitles = (Array.isArray(candidate.jobs) ? candidate.jobs : []).map(job => job?.title || "");
  const text = normalize([
    candidate.queryLane,
    candidate.searchLane,
    candidate.track,
    ...(Array.isArray(candidate.tracks) ? candidate.tracks : [candidate.tracks]),
    ...(Array.isArray(candidate.tags) ? candidate.tags : [candidate.tags]),
    candidate.roleFamily,
    ...(Array.isArray(candidate.roleFamilies) ? candidate.roleFamilies : [candidate.roleFamilies]),
    candidate.title,
    ...jobTitles,
  ].filter(Boolean).join(" "));
  const model = normalize(candidate.model);
  const groupScores = [];
  const modelMatch = (preferenceContrast.models || []).find(row => normalize(row.feature) === model);
  if (modelMatch) groupScores.push(Number(modelMatch.likedMinusDisliked) || 0);
  for (const groupName of ["tracks", "roleFamilies"]) {
    const matches = (preferenceContrast[groupName] || []).filter(row => {
      const feature = normalize(row.feature);
      return feature && (` ${text} `).includes(` ${feature} `);
    });
    if (matches.length) groupScores.push(matches.reduce((sum, row) => sum + (Number(row.likedMinusDisliked) || 0), 0) / matches.length);
  }
  const score = groupScores.reduce((sum, value) => sum + value, 0);
  return Math.round(Math.max(-0.3, Math.min(0.3, score)) * 20 * 100) / 100;
}

function searchPriority(candidate, preferenceContrast) {
  const locationText = [candidate.country, candidate.location, candidate.locations, candidate.region, candidate.eligibility]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(value => typeof value === "string")
    .join(" ");
  const laneText = String(candidate.queryLane || candidate.searchLane || candidate.sourceName || "");
  const explicit = normalize(locationText);
  const lane = normalize(laneText);
  let geographyScore = 0;
  if (/costa rica/.test(explicit)) geographyScore += 100;
  else if (/latin america|latam/.test(explicit)) geographyScore += 60;
  if (/costa rica/.test(lane)) geographyScore += 40;
  else if (/latin america|latam/.test(lane)) geographyScore += 25;
  const preferenceScore = preferencePriority(candidate, preferenceContrast);
  return {
    geographyScore,
    preferenceScore,
    totalScore: geographyScore + preferenceScore,
  };
}

async function writeDomainCache(cacheFile, entries) {
  const tempPath = `${cacheFile}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: Object.fromEntries(entries) }, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, cacheFile);
}

async function main() {
  const totalStartedAt = performance.now();
  const timingsMs = {};
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input) {
    console.log("Usage: node scripts/resolve-company-domains.mjs <deduped-leads.json> [--concurrency 8] [--region \"Latin America\"] [--search-budget N] [--search-engine both|bing|ddg] [--wikidata-only] [--no-cache] [--out resolved-leads.json]");
    console.log("Bulk-checks Wikidata and reuses cached candidates. A bounded search budget defaults to Bing-only; specify --search-engine both to add the slower fallback. URLs still require first-party verification.");
    if (!options.help) process.exitCode = 2;
    return;
  }
  let stageStartedAt = performance.now();
  const inputPath = path.resolve(root, options.input);
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const candidates = Array.isArray(input) ? input : input.candidates || input.leads || input.companies || [];
  if (!candidates.length) throw new Error("Input contains no company candidates.");
  timingsMs.inputReadMs = Math.round(performance.now() - stageStartedAt);

  stageStartedAt = performance.now();
  const cacheFile = path.resolve(root, options.cacheFile);
  const domainCache = options.useCache ? await readDomainCache(cacheFile) : new Map();
  const output = Array(candidates.length);
  const cacheMisses = [];
  let cacheHits = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (hasSiteCandidate(candidate)) {
      output[index] = candidate;
      continue;
    }
    const key = cacheKey(candidate, options.region);
    const entry = domainCache.get(key);
    if (options.useCache && isFreshCacheEntry(entry)) {
      output[index] = {
        ...candidate,
        ...entry.result,
        ...(entry.kind === "candidate" ? { domainResolutionCacheHit: true } : { domainResolutionStatus: "cached no name-matching official-site candidate found", domainResolutionCacheHit: true }),
      };
      cacheHits += 1;
    } else {
      if (entry) domainCache.delete(key);
      cacheMisses.push({ index, candidate, key });
    }
  }
  timingsMs.cacheReadAndMatchMs = Math.round(performance.now() - stageStartedAt);

  let wikidataSites = new Map();
  stageStartedAt = performance.now();
  try { wikidataSites = await wikidataSitesFor(cacheMisses.map(entry => entry.candidate)); }
  catch (error) { console.log(`Wikidata batch lookup skipped: ${error instanceof Error ? error.message : String(error)}.`); }
  timingsMs.wikidataBatchMs = Math.round(performance.now() - stageStartedAt);
  if (wikidataSites.size) console.log(`Wikidata supplied single-domain suggestions for ${wikidataSites.size} names; every suggestion still needs first-party verification.`);

  const searchQueue = [];
  for (const item of cacheMisses) {
    const { candidate, index, key } = item;
    const suggestedSite = wikidataSites.get(normalize(candidate.name || ""));
    if (!candidate.website && suggestedSite) {
      output[index] = {
        ...candidate,
        websiteCandidate: suggestedSite,
        websiteResolutionSource: "Wikidata official-website property; candidate URL only",
        domainResolutionStatus: "Wikidata suggestion; requires first-party verification",
      };
      if (options.useCache) domainCache.set(key, cacheEntryFor(output[index]));
    } else if (options.wikidataOnly) {
      output[index] = { ...candidate, domainResolutionStatus: "no unambiguous Wikidata website; no search fallback run" };
    } else {
      searchQueue.push(item);
    }
  }
  const preferenceContrast = input.preferenceContrast || null;
  for (const item of searchQueue) item.priority = searchPriority(item.candidate, preferenceContrast);
  searchQueue.sort((left, right) => right.priority.totalScore - left.priority.totalScore || left.index - right.index);
  const selectedSearches = options.searchBudget === undefined ? searchQueue : searchQueue.slice(0, options.searchBudget);
  const deferredSearches = options.searchBudget === undefined ? [] : searchQueue.slice(options.searchBudget);
  for (const item of deferredSearches) {
    output[item.index] = { ...item.candidate, domainResolutionPriority: item.priority, domainResolutionStatus: "deferred: domain search budget reached; candidate left for manual review", domainSearchDeferred: true };
  }

  let cursor = 0;
  let completedSearches = 0;
  stageStartedAt = performance.now();
  await Promise.all(Array.from({ length: Math.min(options.concurrency, selectedSearches.length) }, async () => {
    while (cursor < selectedSearches.length) {
      const item = selectedSearches[cursor++];
      output[item.index] = await searchCandidate({ ...item.candidate, domainResolutionPriority: item.priority }, options.region, options.searchEngine);
      const cacheEntry = cacheEntryFor(output[item.index]);
      if (options.useCache && cacheEntry) domainCache.set(item.key, cacheEntry);
      completedSearches += 1;
      if (completedSearches % 25 === 0 || completedSearches === selectedSearches.length) console.log(`Searched unresolved domains ${completedSearches}/${selectedSearches.length}.`);
    }
  }));
  timingsMs.liveSearchWallMs = Math.round(performance.now() - stageStartedAt);

  const cacheWriteStartedAt = performance.now();
  let cacheWriteMs = 0;
  if (options.useCache && domainCache.size) {
    try {
      await writeDomainCache(cacheFile, domainCache);
      cacheWriteMs = Math.round(performance.now() - cacheWriteStartedAt);
    } catch (error) {
      console.log(`Domain cache write skipped: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }
  timingsMs.cacheWriteMs = cacheWriteMs;

  stageStartedAt = performance.now();
  const outPath = path.resolve(root, options.out || inputPath.replace(/\.json$/i, "-domains-resolved.json"));
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const outputDocument = {
    cohortId: input.cohortId || input.batchId || path.basename(inputPath, ".json"),
    generatedOn: getCostaRicaDate(), sourceInput: path.relative(root, inputPath),
    inputCandidateCount: candidates.length,
    resolvedCount: output.filter(candidate => candidate.website || candidate.websiteCandidate || candidate.domain).length,
    cacheHitCount: cacheHits,
    cacheMissCount: cacheMisses.length,
    wikidataCandidateCount: output.filter(candidate => candidate.websiteResolutionSource?.startsWith("Wikidata")).length,
    perNameSearchCount: selectedSearches.length,
    deferredSearchCount: deferredSearches.length,
    searchBudget: options.searchBudget ?? null,
    searchConcurrency: options.concurrency,
    searchEngine: options.searchEngine,
    cacheFile: options.useCache ? cacheFile : null,
    candidates: output,
  };
  timingsMs.outputWriteMs = 0;
  outputDocument.timingsMs = timingsMs;
  outputDocument.timingsMs.totalMs = Math.round(performance.now() - totalStartedAt);
  await fs.writeFile(outPath, `${JSON.stringify(outputDocument, null, 2)}\n`, "utf8");
  timingsMs.outputWriteMs = Math.round(performance.now() - stageStartedAt);
  timingsMs.totalMs = Math.round(performance.now() - totalStartedAt);
  outputDocument.timingsMs = timingsMs;
  await fs.writeFile(outPath, `${JSON.stringify({
    ...outputDocument,
    timingsMs,
  }, null, 2)}\n`, "utf8");
  const candidateCount = output.filter(candidate => candidate.website || candidate.websiteCandidate || candidate.domain).length;
  const engineRequestCount = output.reduce((sum, candidate) => sum + (candidate.domainSearch?.requestCount || 0), 0);
  const perNameSearchMs = output.reduce((sum, candidate) => sum + (candidate.domainSearch?.elapsedMs || 0), 0);
  console.log(`Checked ${candidates.length} name-unique candidates; ${candidateCount} now have a website candidate.`);
  console.log(`Domain resolution timing: ${JSON.stringify({ ...timingsMs, engineRequestCount, perNameSearchMs, cacheHits, cacheMisses: cacheMisses.length, deferredSearches: deferredSearches.length })}`);
  console.log(`Wrote ${path.relative(root, outPath)}. URLs still require official-site, software-fit, and location verification.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
