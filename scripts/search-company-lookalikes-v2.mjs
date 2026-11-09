#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { getCostaRicaDate } from "./company-search-utils.mjs";
import { buildKeywordSearchPlan, deriveKeywordProfile, isLikelyCompanyListResult, keywordAlignment } from "./lookalike-keyword-registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePages = [
  { name: "Global custom software firms", url: "https://softwaredevelopmentontario.ca/best-custom-software-development-companies/", type: "global software services", keywordFamilies: ["software-services", "product-engineering"] },
  { name: "Offshore software development firms", url: "https://x-team.com/magazine/top-offshore-software-development-outsourcing-companies/", type: "global software services", keywordFamilies: ["software-outsourcing", "software-services"] },
  { name: "Custom software firms", url: "https://www.lowcode.agency/blog/best-custom-software-development-companies", type: "global software services", keywordFamilies: ["software-services", "product-engineering"] },
  { name: "Software outsourcing firms", url: "https://ideaware.co/blog/top-software-outsourcing-companies-2026/", type: "software outsourcing", keywordFamilies: ["software-outsourcing", "software-services"] },
  { name: "Offshore software firms", url: "https://gaincafe.com/blog/top-offshore-software-development-companies", type: "global software services", keywordFamilies: ["software-outsourcing"] },
  { name: "Nearshore engineering staff firms", url: "https://coderslink.com/employers/blog/best-nearshore-staff-augmentation-companies", type: "engineering staffing", keywordFamilies: ["nearshore", "software-outsourcing"] },
  { name: "Nearshore software development firms", url: "https://www.ryzlabs.com/best/nearshore-software-development-companies", type: "nearshore software services", keywordFamilies: ["nearshore", "software-services"] },
  { name: "Custom software development firms", url: "https://algoscale.com/blog/top-custom-software-development-companies/", type: "global software services", keywordFamilies: ["software-services", "product-engineering"] },
  { name: "Nearshore software firms", url: "https://softwareoutsourcing.com/companies/nearshore-software-development/", type: "nearshore software services", keywordFamilies: ["nearshore", "software-outsourcing"] },
  { name: "Custom software development firms", url: "https://decode.agency/article/custom-software-development-companies/", type: "global software services", keywordFamilies: ["software-services", "product-engineering"] },
  { name: "Software outsourcing firms", url: "https://themona.global/blog/top-software-development-outsourcing-companies/", type: "software outsourcing", keywordFamilies: ["software-outsourcing", "software-services"] },
  { name: "Custom software firms", url: "https://www.statwharf.com/best/custom-software-development-companies/", type: "global software services", keywordFamilies: ["software-services"] },
  { name: "Remote-first technology employers", url: "https://remoteintech.company/companies/", type: "remote engineering employers", kind: "remote-directory", keywordFamilies: ["direct-software-employers"] },
];
const blockedHost = /(^|\.)(bing\.com|duckduckgo\.com|google\.[a-z.]+|linkedin\.com|angel\.co|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|x\.com|twitter\.com|crunchbase\.com|clutch\.co|sortlist\.com|wikipedia\.org|g2\.com|gartner\.com|capterra\.com|wellfound\.com|glassdoor\.[a-z.]+|indeed\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|jobscore\.com|workwise\.io|gupy\.io|enlizt\.me|notion\.site|adzuna\.[a-z.]+|remoteok\.io|jobicy\.com|remotive\.com|himalayas\.app|findremote\.jobs|nearshore\.cr|bark\.com)$/i;
const nameStops = /^(company|companies|name|provider|providers|vendor|vendors|headquarters|location|services|key services|key focus|overview|how we chose|why choose|read more|learn more|visit website|official website|view profile|website|source|contact|linkedin|quick comparison|top \d+|the picks at a glance|what is .+|how much .+|frequently asked questions)$/i;
const junkName = /\b(how to|get help|calculator|translation|translate|dictionary|font|video|porn|game|games|rental|hotel|villa|resort|football|soccer|betting|university|universidad|lotter[iy]|recipe|movie|lyrics|windows support|forum|weather|flights?|pricing|case study|guide|comparison|alternatives|competitors|best software|top software|company list)\b/i;
const multiPartSuffixes = new Set(["co.uk", "org.uk", "com.au", "net.au", "co.nz", "com.br", "co.in", "com.mx", "com.ar", "co.cr", "co.za", "com.co", "com.pe", "com.ec", "com.uy", "com.gt", "com.sv", "com.ni", "com.pa", "com.do", "com.ve", "com.py", "com.bo"]);

function parseArgs(args) {
  const options = { target: 100, concurrency: 12, keywordSearchBudget: 6, out: "", batchId: "", import: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--import") { options.import = true; continue; }
    if (["--target", "--concurrency", "--keyword-search-budget", "--out", "--batch-id"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--target") options.target = Number(value);
      else if (arg === "--concurrency") options.concurrency = Number(value);
      else if (arg === "--keyword-search-budget") options.keywordSearchBudget = Number(value);
      else if (arg === "--out") options.out = value;
      else options.batchId = value;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.target) || options.target < 1 || options.target > 100) throw new Error("--target must be between 1 and 100.");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 24) throw new Error("--concurrency must be between 1 and 24.");
  if (!Number.isInteger(options.keywordSearchBudget) || options.keywordSearchBudget < 0 || options.keywordSearchBudget > 12) throw new Error("--keyword-search-budget must be between 0 and 12.");
  return options;
}

function normalize(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nameKey(value) { return normalize(value).replace(/\s+/g, ""); }

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function plainText(value) {
  return decode(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function domainFor(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (blockedHost.test(host) || !host.includes(".")) return "";
    const parts = host.split(".");
    return parts.slice(multiPartSuffixes.has(parts.slice(-2).join(".")) ? -3 : -2).join(".");
  } catch { return ""; }
}

function rootUrl(domain) { return domain ? `https://${domain}/` : ""; }

const genericCompanyNameTokens = new Set(["company", "companies", "inc", "llc", "ltd", "corp", "corporation", "group", "global", "software", "technology", "technologies", "digital", "services", "service", "solutions", "solution", "development", "systems", "system", "consulting", "agency", "the", "and"]);
function sourceDomainMatchesCompany(name, domain) {
  const nameTokens = normalize(name).split(/\s+/).filter(token => token.length >= 3 && !genericCompanyNameTokens.has(token));
  if (!nameTokens.length || !domain) return false;
  const parts = domain.toLowerCase().split(".");
  const suffix = parts.slice(-2).join(".");
  const host = normalize(parts.slice(0, multiPartSuffixes.has(suffix) ? -2 : -1).join(" "));
  return nameTokens.some(token => host.includes(token));
}

function cleanCompanyName(value) {
  let name = plainText(value).replace(/\s+/g, " ").trim().replace(/^\d+[.)]\s*/, "").replace(/^[#*•-]+\s*/, "").replace(/[<>]+$/g, "");
  name = name.replace(/\s+(?:—|–|\|)\s+.*$/, "").trim();
  if (!name || name.length < 2 || name.length > 90 || nameStops.test(name) || junkName.test(name)) return "";
  if (/^(?:\$|\d+[+%]?|yes$|no$|not published$|not listed$)/i.test(name)) return "";
  return name;
}

function extractPageCompanies(html, pageUrl, page) {
  const sourceDomain = domainFor(pageUrl);
  const companies = [];
  const add = (rawName, rawUrl = "", method = "list-text", sourceContext = "") => {
    const name = cleanCompanyName(rawName);
    if (!name) return;
    let absolute = "";
    try { if (rawUrl) absolute = new URL(decode(rawUrl), pageUrl).href; } catch {}
    let domain = absolute ? domainFor(absolute) : "";
    if (domain && !sourceDomainMatchesCompany(name, domain)) { absolute = ""; domain = ""; }
    if (domain && domain === sourceDomain) return;
    const careersUrl = absolute && /\/(?:careers?|jobs?|join-us|work-with-us)(?:\/|$)/i.test(new URL(absolute).pathname) ? absolute : "";
    companies.push({
      name, domain, website: rootUrl(domain), careersUrl, sourcePage: pageUrl,
      sourceMethod: method, sourceName: page.name, sourceType: page.type,
      domainSource: domain ? "source-page company link; name/domain tokens overlap, not verified" : "",
      sourceContext: plainText(sourceContext).slice(0, 1000),
      keywordFamilies: page.keywordFamilies || [], queryFamily: page.queryFamily || "",
    });
  };

  const anchorPattern = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
  if (page.kind === "remote-directory") {
    const anchors = [...html.matchAll(anchorPattern)].map(match => ({ href: decode(match[1] || match[2]), label: plainText(match[3]) }));
    for (let index = 0; index < anchors.length; index += 1) {
      if (!/^\/companies\/[^/]+\/?$/.test(anchors[index].href)) continue;
      const name = cleanCompanyName(anchors[index].label);
      if (!name) continue;
      let external = "";
      for (let next = index + 1; next < anchors.length && !/^\/companies\/[^/]+\/?$/.test(anchors[next].href); next += 1) {
        try {
          const candidateUrl = new URL(anchors[next].href, pageUrl).href;
          if (domainFor(candidateUrl) && domainFor(candidateUrl) !== sourceDomain) { external = candidateUrl; break; }
        } catch {}
      }
      if (external) add(name, external, "remote-directory-company-link");
    }
    return companies;
  }

  for (const tableMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = tableMatch[1];
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]);
    const headerCells = [...(rows[0] || "").matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(match => plainText(match[1]));
    const companyColumn = headerCells.findIndex(cell => /company|vendor|provider|firm/i.test(cell));
    if (companyColumn < 0) continue;
    for (const row of rows.slice(1)) {
      const cells = [...row.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(match => match[1]);
      const name = cleanCompanyName(cells[companyColumn] || "");
      if (!name) continue;
      const links = [...row.matchAll(anchorPattern)].map(match => decode(match[1] || match[2]));
      let companyUrl = "";
      for (const link of links) {
        try {
          const absolute = new URL(link, pageUrl).href;
          if (domainFor(absolute) && domainFor(absolute) !== sourceDomain) { companyUrl = absolute; break; }
        } catch {}
      }
      const sourceContext = cells.filter((_, index) => index !== companyColumn).map(plainText).filter(Boolean).join(" | ");
      add(name, companyUrl, "comparison-table", sourceContext);
    }
  }

  const headingMatches = [...html.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)];
  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index];
    if (!/^\s*\d+[.)]/.test(plainText(match[1]))) continue;
    const heading = cleanCompanyName(match[1]);
    if (heading) {
      const bodyStart = match.index + match[0].length;
      const bodyEnd = headingMatches[index + 1]?.index ?? Math.min(html.length, bodyStart + 8000);
      add(heading, "", "numbered-company-heading", html.slice(bodyStart, Math.min(bodyEnd, bodyStart + 8000)));
    }
  }

  return companies;
}

async function mapPool(items, concurrency, worker) {
  const results = Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function fetchSourcePage(page) {
  const started = performance.now();
  try {
    const response = await fetch(page.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; TheCompV2/1.0; +company discovery)", accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const finalUrl = response.url;
    const companies = extractPageCompanies(html, finalUrl, page);
    return { ...page, finalUrl, status: response.status, elapsedMs: Math.round(performance.now() - started), candidateCount: companies.length, companies };
  } catch (error) {
    return { ...page, elapsedMs: Math.round(performance.now() - started), candidateCount: 0, companies: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function wikidataDomainsFor(names) {
  const result = new Map();
  const uniqueNames = [...new Set(names)].filter(Boolean);
  for (let offset = 0; offset < uniqueNames.length; offset += 120) {
    const chunk = uniqueNames.slice(offset, offset + 120);
    const values = chunk.map(name => `${JSON.stringify(name)}@en`).join(" ");
    const query = `SELECT ?label ?site WHERE { VALUES ?label { ${values} } ?item rdfs:label ?label; wdt:P856 ?site. FILTER (lang(?label) = "en") }`;
    try {
      const response = await fetch("https://query.wikidata.org/sparql", {
        method: "POST",
        headers: { accept: "application/sparql-results+json", "content-type": "application/x-www-form-urlencoded", "user-agent": "TheCompV2/1.0 (company lookalike candidates)" },
        body: new URLSearchParams({ query, format: "json" }),
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok) continue;
      const data = await response.json();
      for (const row of data.results?.bindings || []) {
        const name = row.label?.value || "";
        const domain = domainFor(row.site?.value || "");
        if (name && domain) {
          const matches = result.get(nameKey(name)) || new Set();
          matches.add(domain);
          result.set(nameKey(name), matches);
        }
      }
    } catch {}
  }
  return new Map([...result].filter(([, domains]) => domains.size === 1).map(([key, domains]) => [key, [...domains][0]]));
}

async function loadMongo() {
  if (typeof process.loadEnvFile === "function" && !process.env.MONGODB_URI) {
    try { process.loadEnvFile(path.join(root, ".env")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required; V2 must use the live likes and catalog for seeds and deduplication.");
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "lva");
    const [companies, preferences] = await Promise.all([
      db.collection(process.env.COMP_COMPANIES_COLLECTION || "comp_companies").find({}, {
        projection: { _id: 1, key: 1, name: 1, names: 1, website: 1, domain: 1, model: 1, tracks: 1 },
      }).toArray(),
      db.collection(process.env.COMP_PREFERENCES_COLLECTION || "comp_preferences").find({
        ownerId: "__shared_company_directory__", liked: true, archived: { $ne: true },
      }, { projection: { companyKey: 1 } }).toArray(),
    ]);
    return { companies, preferences };
  } finally { await client.close(); }
}

function uniqueSeedCompanies(mongo) {
  const byKey = new Map(mongo.companies.map(company => [String(company._id || company.key), company]));
  const seen = new Set();
  return mongo.preferences.map(preference => byKey.get(String(preference.companyKey))).filter(company => {
    if (!company) return false;
    const key = String(company._id || company.key);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deriveLikeProfile(likes) {
  const models = {};
  const trackCounts = new Map();
  for (const company of likes) {
    const model = company.model || "unknown";
    models[model] = (models[model] || 0) + 1;
    for (const track of company.tracks || []) trackCounts.set(track, (trackCounts.get(track) || 0) + 1);
  }
  return { models, topTracks: [...trackCounts].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([track, count]) => ({ track, count })) };
}

function collectCandidates(pages, mongo, likes) {
  const existingNames = new Set();
  const existingDomains = new Set();
  for (const company of mongo.companies) {
    for (const name of [company.name, ...(company.names || [])]) if (nameKey(name)) existingNames.add(nameKey(name));
    const domain = domainFor(company.website || (company.domain ? rootUrl(company.domain) : ""));
    if (domain) existingDomains.add(domain);
  }
  const seedNames = new Set(likes.flatMap(company => [company.name, ...(company.names || [])]).map(nameKey));
  const seedDomains = new Set(likes.map(company => domainFor(company.website || (company.domain ? rootUrl(company.domain) : ""))).filter(Boolean));
  const candidates = new Map();
  let catalogDuplicates = 0;

  for (const page of pages) {
    for (const row of page.companies || []) {
      const key = nameKey(row.name);
      if (!key || seedNames.has(key) || existingNames.has(key)) { catalogDuplicates += 1; continue; }
      if (row.domain && (existingDomains.has(row.domain) || seedDomains.has(row.domain))) { catalogDuplicates += 1; continue; }
      const candidate = candidates.get(key) || {
        name: row.name,
        domain: row.domain || "",
        website: row.website || "",
        careersUrl: row.careersUrl || "",
        domainSource: row.domainSource || "",
        sourceMatches: new Set(),
        sources: [],
      };
      if (!candidate.domain && row.domain) { candidate.domain = row.domain; candidate.website = row.website; candidate.domainSource = row.domainSource || ""; }
      if (!candidate.careersUrl && row.careersUrl) candidate.careersUrl = row.careersUrl;
      candidate.sourceMatches.add(row.sourceName);
      candidate.sources.push({
        sourceName: row.sourceName, sourceType: row.sourceType, sourcePage: row.sourcePage,
        sourceMethod: row.sourceMethod, sourceContext: row.sourceContext || "",
        keywordFamilies: row.keywordFamilies || [], queryFamily: row.queryFamily || "",
      });
      candidates.set(key, candidate);
    }
  }
  return { candidates: [...candidates.values()], catalogDuplicates };
}

function duckDuckGoSearchResults(html) {
  const results = [];
  for (const match of html.matchAll(/<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi)) {
    const open = match[0].slice(0, match[0].indexOf(">") + 1);
    const hrefMatch = open.match(/\bhref=(?:"([^"]+)"|'([^']+)')/i);
    const href = decode(hrefMatch?.[1] || hrefMatch?.[2] || "");
    let url;
    try {
      const parsed = new URL(href, "https://duckduckgo.com");
      url = parsed.hostname.endsWith("duckduckgo.com") && parsed.pathname === "/l/"
        ? new URL(parsed.searchParams.get("uddg") || "") : parsed;
    } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || blockedHost.test(url.hostname)) continue;
    url.search = "";
    url.hash = "";
    const title = plainText(match[0]);
    const nearbyHtml = html.slice(match.index, match.index + 3500);
    const snippet = plainText(nearbyHtml.match(/<(?:a|div)\b[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i)?.[1] || "");
    results.push({ title, snippet, url: url.href });
  }
  return results;
}

async function searchKeywordSources(search) {
  const started = performance.now();
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(search.query)}`;
  try {
    const response = await fetch(url, {
      redirect: "follow", signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; TheCompV2/2.0; +company discovery)", accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const results = duckDuckGoSearchResults(await response.text()).filter(isLikelyCompanyListResult).slice(0, 4);
    return { ...search, elapsedMs: Math.round(performance.now() - started), resultCount: results.length, results };
  } catch (error) {
    return { ...search, elapsedMs: Math.round(performance.now() - started), resultCount: 0, results: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function sourcesFromKeywordSearch(searchResults, existingSources) {
  const known = new Set(existingSources.map(source => source.url));
  const discovered = new Map();
  for (const search of searchResults) {
    const queryFamilies = search.familyIds || [search.queryFamily];
    for (const result of search.results || []) {
      if (known.has(result.url)) continue;
      const existing = discovered.get(result.url);
      if (existing) {
        existing.keywordFamilies = [...new Set([...existing.keywordFamilies, ...queryFamilies])];
        existing.keywordQueries.push(search.query);
        existing.searchResultEvidence.push({ title: result.title, snippet: result.snippet });
        continue;
      }
      discovered.set(result.url, {
        name: `Keyword source: ${search.label}`,
        url: result.url,
        type: `keyword lookalike source (${search.queryFamily})`,
        kind: "keyword-list",
        queryFamily: search.queryFamily || "liked-tech-stack",
        keywordFamilies: queryFamilies,
        keywordQueries: [search.query],
        searchResultEvidence: [{ title: result.title, snippet: result.snippet }],
      });
    }
  }
  return [...discovered.values()];
}

function rankByLikedSimilarity(candidates, keywordProfile) {
  return candidates.map(candidate => {
    const sourceMatchCount = candidate.sourceMatches.size;
    const aligned = keywordAlignment({ ...candidate, sourceMatchCount }, keywordProfile);
    return {
      ...candidate,
      sourceMatches: [...candidate.sourceMatches],
      sourceMatchCount,
      ...aligned,
      domainSource: candidate.domainSource || "domain candidate; source not recorded",
    };
  }).sort((left, right) => right.similarityScore - left.similarityScore
    || right.keywordScore - left.keywordScore
    || right.sourceMatchCount - left.sourceMatchCount
    || left.name.localeCompare(right.name));
}

async function importBatch(batch) {
  let baseUrl = process.env.COMPANY_IMPORT_BASE_URL || "http://127.0.0.1:3000";
  let origin;
  try { origin = new URL(baseUrl).origin; } catch { throw new Error("COMPANY_IMPORT_BASE_URL must be a valid HTTP(S) origin."); }
  const endpoint = new URL("/api/comp/enrich", origin);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { message: text.slice(0, 400) }; }
  if (!response.ok) throw new Error(`Import failed with HTTP ${response.status}: ${result.error || result.message || response.statusText}`);
  return { origin, result };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/search-company-lookalikes-v2.mjs [--target 100] [--concurrency 12] [--keyword-search-budget 6] [--batch-id id] [--out batch.json] [--import]");
    console.log("Builds a keyword profile from active likes, searches targeted worldwide company-list queries, scores source-row keyword evidence, and imports minimal pending leads.");
    return;
  }

  const started = performance.now();
  const today = getCostaRicaDate();
  const mongo = await loadMongo();
  const likes = uniqueSeedCompanies(mongo);
  if (!likes.length) throw new Error("No active liked companies were found in the shared catalog.");
  const likeProfile = deriveLikeProfile(likes);
  const keywordProfile = deriveKeywordProfile(likes);
  const keywordSearchPlan = buildKeywordSearchPlan(keywordProfile, options.keywordSearchBudget);
  const hasServiceLikes = (likeProfile.models.outsourcing || 0) > 0 || likes.some(company => (company.tracks || []).some(track => /nearshore|software|engineering/i.test(track)));
  const hasDirectLikes = (likeProfile.models.direct || 0) > 0 || (likeProfile.models.unknown || 0) > 0;
  const selectedSources = sourcePages.filter(page => page.kind === "remote-directory" ? hasDirectLikes : hasServiceLikes);

  const keywordSearchStarted = performance.now();
  const keywordSearchResults = await mapPool(keywordSearchPlan, Math.min(options.concurrency, 6), searchKeywordSources);
  const keywordSearchWallMs = Math.round(performance.now() - keywordSearchStarted);
  const discoveredSources = sourcesFromKeywordSearch(keywordSearchResults, selectedSources);
  const allSources = [...selectedSources, ...discoveredSources];
  const sourceStarted = performance.now();
  const pages = await mapPool(allSources, options.concurrency, fetchSourcePage);
  const sourceFetchWallMs = Math.round(performance.now() - sourceStarted);
  const pool = collectCandidates(pages, mongo, likes);
  const missingDomain = pool.candidates.filter(candidate => !candidate.domain);
  const wikidataStarted = performance.now();
  const wikidataDomains = await wikidataDomainsFor(missingDomain.map(candidate => candidate.name));
  const wikidataWallMs = Math.round(performance.now() - wikidataStarted);
  for (const candidate of missingDomain) {
    const domain = wikidataDomains.get(nameKey(candidate.name));
    if (domain && sourceDomainMatchesCompany(candidate.name, domain)) {
      candidate.domain = domain;
      candidate.website = rootUrl(domain);
      candidate.domainSource = "Wikidata website suggestion; name/domain tokens overlap, not verified";
    }
  }

  const seenDomains = new Set();
  const catalogDomains = new Set(mongo.companies.map(company => domainFor(company.website || (company.domain ? rootUrl(company.domain) : ""))).filter(Boolean));
  const domainUnique = pool.candidates
    .filter(candidate => {
      if (!candidate.domain || catalogDomains.has(candidate.domain) || seenDomains.has(candidate.domain)) return false;
      seenDomains.add(candidate.domain);
      return true;
    });
  const ranked = rankByLikedSimilarity(domainUnique, keywordProfile);

  const batchId = options.batchId || `lookalikes-v2-${today.replaceAll("-", "")}`;
  const companies = ranked.slice(0, options.target).map(({ name, website, careersUrl }) => ({
    name,
    website,
    ...(careersUrl ? { careersUrl } : {}),
    tags: ["new"],
  }));
  const batch = { batchId, companies };
  const outPath = path.resolve(root, options.out || `company-batches/${batchId}.json`);
  const reportPath = outPath.replace(/\.json$/i, "-report.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");

  let importResult = null;
  const report = {
    algorithm: "The Comp lookalike discovery V2",
    batchId,
    generatedOn: today,
    status: options.import ? "batch-import-pending" : "batch-ready",
    searchScope: "Worldwide; global software, engineering, nearshore, and outsourcing lists",
    seedSource: "Active liked companies from the live shared Mongo catalog only",
    seedCount: likes.length,
    seedProfile: likeProfile,
    keywordProfile,
    keywordSearchPlan,
    keywordSearchResults,
    seedCompanies: likes.map(company => ({ name: company.name, model: company.model || "unknown", tracks: company.tracks || [] })),
    catalogCompanies: mongo.companies.length,
    sourcePages: allSources,
    sourceFetchResults: pages.map(({ companies: _companies, ...page }) => page),
    keywordSearchWallMs,
    sourceFetchWallMs,
    sourcePageCandidateCount: pages.reduce((sum, page) => sum + (page.companies?.length || 0), 0),
    catalogDuplicateCount: pool.catalogDuplicates,
    unresolvedDomainCount: missingDomain.filter(candidate => !wikidataDomains.has(nameKey(candidate.name))).length,
    wikidataCandidateCount: wikidataDomains.size,
    wikidataWallMs,
    eligibleDomainCount: ranked.length,
    selectedCount: companies.length,
    selectedWithCareersUrl: companies.filter(company => company.careersUrl).length,
    selectedBatch: { count: companies.length, companies },
    imported: null,
    timingsMs: { keywordSearchWallMs, sourceFetchWallMs, wikidataWallMs, totalMs: Math.round(performance.now() - started) },
    candidates: ranked,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (options.import) {
    const importStarted = performance.now();
    try {
      importResult = await importBatch(batch);
      report.status = "imported-as-pending-review-leads";
      report.importedOn = today;
      report.imported = importResult.result;
    } catch (error) {
      report.status = "batch-import-failed";
      report.importError = error instanceof Error ? error.message : String(error);
      report.timingsMs.importMs = Math.round(performance.now() - importStarted);
      report.timingsMs.totalMs = Math.round(performance.now() - started);
      await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      throw error;
    }
    report.timingsMs.importMs = Math.round(performance.now() - importStarted);
    report.timingsMs.totalMs = Math.round(performance.now() - started);
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(`${likes.length} active liked-company seeds; searched ${keywordSearchResults.length} keyword queries in ${keywordSearchWallMs} ms and fetched ${pages.filter(page => !page.error).length}/${pages.length} list sources in ${sourceFetchWallMs} ms.`);
  console.log(`${pool.candidates.length} non-duplicate names; ${ranked.length} unique domain candidates ranked by liked-signal alignment and independent source matches; selected ${companies.length}; careers links found: ${report.selectedWithCareersUrl}.`);
  console.log(`Wrote ${path.relative(root, outPath)} and ${path.relative(root, reportPath)}.`);
  if (importResult) console.log(`Imported ${importResult.result.imported} pending review leads (${importResult.result.created} created, ${importResult.result.updated} updated).`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
