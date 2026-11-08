#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const today = getCostaRicaDate();

function usage() {
  console.log("Usage: node scripts/dedupe-company-candidates.mjs <leads.json> [...more-leads.json] [--out unique-leads.json] [--ledger ledger.json] [--cohort id] [--limit 1000] [--snapshot-out mongo-snapshot.json] [--snapshot-in mongo-snapshot.json] [--files-only] [--names-only]");
  console.log("Lead JSON may be an array or an object with candidates, leads, or companies.");
  console.log("When MONGODB_URI is available, the script reads comp_companies once, then compares every lead locally.");
  console.log("Use --names-only for an early search pass; resolve official domains and run a full dedupe before import.");
}

function parseArgs(args) {
  const options = { limit: 1000, filesOnly: false, namesOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--files-only") { options.filesOnly = true; continue; }
    if (arg === "--names-only") { options.namesOnly = true; continue; }
    if (["--out", "--ledger", "--cohort", "--limit", "--snapshot-out", "--snapshot-in"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      const optionName = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[optionName] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    options.inputs ||= [];
    options.inputs.push(arg);
  }
  options.limit = Number(options.limit);
  if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error("--limit must be a positive integer.");
  return options;
}

function normalizeCompanyName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const nameAliases = {
  accenturemexico: "accenture",
  athenaworks: "athenaworks",
  bairesdev: "bairesdev",
  fullstacklabs: "fullstack",
  applaudostudios: "applaudo",
};
function nameKey(value) {
  const normalized = normalizeCompanyName(value);
  return nameAliases[normalized] || normalized;
}

const multipartSuffixes = new Set([
  "co.uk", "org.uk", "com.au", "net.au", "co.nz", "com.br", "co.in", "com.mx", "com.ar", "co.cr", "co.za",
  "co.id", "co.jp", "co.kr", "com.sg", "com.my", "com.hk", "com.tw", "com.cn", "com.tr", "co.il",
  "com.co", "com.pe", "com.ec", "com.uy", "com.gt", "com.sv", "com.ni", "com.pa", "com.do", "com.ve",
  "com.py", "com.bo", "com.ng", "co.ke", "com.pk", "com.bd", "com.ph",
]);
const sharedHosts = new Set(["github.io", "webflow.io", "notion.site"]);
const listingHosts = /(^|\.)(linkedin\.com|angel\.co|wellfound\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com)$/;
const domainAliases = {
  "clevertech.biz": "lumenalta.com", "basecamp.com": "37signals.com",
  "iosapptemplates.com": "instamobile.io", "heykona.com": "15five.com",
  "plai.team": "peoplelogic.ai", "blameless.com": "firehydrant.com",
  "hmn.md": "humanmade.com", "helpscout.net": "helpscout.com",
  "runpanther.io": "panther.com", "heapanalytics.com": "heap.io",
  "helabs.com": "impulso.team", "formidable.com": "nearform.com",
};

function companyDomain(value) {
  if (!value) return undefined;
  const raw = String(value).trim();
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (listingHosts.test(host)) return undefined;
    if (host === "github.com" && !/^\/(?:about(?:\/.*)?)?$/.test(url.pathname)) return undefined;
    const parts = host.split(".");
    const suffix = parts.slice(-2).join(".");
    const domain = sharedHosts.has(suffix) ? host : parts.slice(multipartSuffixes.has(suffix) ? -3 : -2).join(".");
    return domainAliases[domain] || domain;
  } catch { return undefined; }
}

function companyNames(company) {
  return [...new Set([company.name, ...(company.names || []), ...(company.aliases || [])].filter(value => typeof value === "string" && value.trim()))];
}

function recordKey(company) {
  return String(company._id || company.key || companyDomain(company.website || company.domain) || nameKey(company.name) || "unnamed");
}

function addToIndex(index, company, source) {
  const record = { company, source };
  for (const name of companyNames(company)) {
    const key = nameKey(name);
    if (key && !index.names.has(key)) index.names.set(key, record);
  }
  const domain = companyDomain(company.website || company.domain);
  if (domain && !index.domains.has(domain)) index.domains.set(domain, record);
  return domain;
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw new Error(`Could not parse ${path.relative(root, file)}: ${error.message}`);
  }
}

function getCompanies(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.companies)) return value.companies;
  if (Array.isArray(value?.candidates)) return value.candidates;
  if (Array.isArray(value?.leads)) return value.leads;
  return [];
}

async function loadBundledCatalog() {
  const rows = [];
  const dataDir = path.join(root, "lib", "comp", "data");
  for (const filename of ["companies.json", "expanded-companies.json", "additional-companies.json", "nearshore.json"]) {
    rows.push(...getCompanies(await readJson(path.join(dataDir, filename))));
  }
  return rows;
}

async function loadPreviousBatches() {
  const dir = path.join(root, "company-batches");
  const files = (await fs.readdir(dir).catch(() => [])).filter(filename => filename.endsWith(".json") && !filename.includes("ledger"));
  const rows = [];
  for (const filename of files) {
    const value = await readJson(path.join(dir, filename));
    // Discovery pools and dedupe outputs are candidates/leads, not imported batches.
    // Index only completed batch documents so a lead file can never match itself.
    if (typeof value?.batchId === "string" && Array.isArray(value.companies)) rows.push(...value.companies);
  }
  return rows;
}

async function loadMongoCatalog(snapshotPath = "") {
  if (snapshotPath) {
    const snapshot = await readJson(path.resolve(snapshotPath));
    if (!snapshot || !Array.isArray(snapshot.companies) || !Array.isArray(snapshot.preferences)) {
      throw new Error(`Invalid Mongo snapshot: ${snapshotPath} must contain companies and preferences arrays.`);
    }
    return { companies: snapshot.companies, preferences: snapshot.preferences, available: true, snapshotSource: "saved MongoDB snapshot" };
  }
  if (typeof process.loadEnvFile === "function" && !process.env.MONGODB_URI) {
    try { process.loadEnvFile(path.join(root, ".env")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (!process.env.MONGODB_URI) return { companies: [], preferences: [], available: false };
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "lva");
    const companyCollection = process.env.COMP_COMPANIES_COLLECTION || "comp_companies";
    const preferenceCollection = process.env.COMP_PREFERENCES_COLLECTION || "comp_preferences";
    const companies = await db.collection(companyCollection).find({}, {
      // Keep the exclusion snapshot small: the company index only needs names,
      // aliases, and website; the baseline only uses locations and job fields.
      projection: {
        _id: 1, key: 1, name: 1, names: 1, aliases: 1, website: 1, domain: 1,
        locations: 1, tracks: 1, model: 1,
        "jobs.title": 1, "jobs.location": 1, "jobs.eligibility": 1,
      },
    }).toArray();
    const preferences = await db.collection(preferenceCollection).find({
      ownerId: "__shared_company_directory__",
      archived: { $ne: true },
      $or: [{ liked: true }, { disliked: true }],
    }, { projection: { companyKey: 1, liked: 1, disliked: 1, archived: 1 } }).toArray();
    return { companies, preferences, available: true, snapshotSource: "MongoDB" };
  } finally { await client.close(); }
}

function buildPreferenceBaseline(mongo, preferenceField) {
  const byKey = new Map(mongo.companies.map(company => [String(company._id || company.key), company]));
  const regionPattern = /costa\s+rica|\blatam\b|latin america/i;
  const active = mongo.preferences
    .filter(preference => preference[preferenceField] === true && preference.archived !== true)
    .map(preference => byKey.get(String(preference.companyKey)))
    .filter(company => company && regionPattern.test([
      ...(company.locations || []),
      ...(company.jobs || []).flatMap(job => [job.title, job.location, job.eligibility]),
    ].filter(Boolean).join(" ")));
  const tracks = new Map();
  for (const company of active) for (const track of company.tracks || []) tracks.set(track, (tracks.get(track) || 0) + 1);
  const trackKey = preferenceField === "liked" ? "topTracks" : "dislikedTracks";
  const countKey = preferenceField === "liked" ? "activeLikedWithCostaRicaOrLatamEvidence" : "activeDislikedWithCostaRicaOrLatamEvidence";
  return {
    [countKey]: active.length,
    [trackKey]: [...tracks.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12).map(([track, count]) => ({ track, count })),
    modelMix: Object.entries(active.reduce((counts, company) => {
      const key = company.model || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})).sort((left, right) => right[1] - left[1]),
  };
}

function activeRegionalPreferenceCompanies(mongo, preferenceField) {
  const byKey = new Map(mongo.companies.map(company => [String(company._id || company.key), company]));
  const regionPattern = /costa\s+rica|\blatam\b|latin america/i;
  const seen = new Set();
  return mongo.preferences
    .filter(preference => preference[preferenceField] === true && preference.archived !== true)
    .filter(preference => {
      const key = String(preference.companyKey);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(preference => byKey.get(String(preference.companyKey)))
    .filter(company => company && regionPattern.test([
      ...(company.locations || []),
      ...(company.jobs || []).flatMap(job => [job.title, job.location, job.eligibility]),
    ].filter(Boolean).join(" ")));
}

function featureCounts(companies, getFeatures) {
  const counts = new Map();
  for (const company of companies) {
    const seen = new Set();
    for (const raw of getFeatures(company)) {
      const label = String(raw || "").trim();
      const key = label.toLocaleLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key) || { feature: label, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  return counts;
}

function comparePreferenceFeatures(liked, disliked, getFeatures) {
  const likedCounts = featureCounts(liked, getFeatures);
  const dislikedCounts = featureCounts(disliked, getFeatures);
  const likedTotal = Math.max(1, liked.length);
  const dislikedTotal = Math.max(1, disliked.length);
  const keys = new Set([...likedCounts.keys(), ...dislikedCounts.keys()]);
  return [...keys].map(key => {
    const likedEntry = likedCounts.get(key);
    const dislikedEntry = dislikedCounts.get(key);
    const likedCount = likedEntry?.count || 0;
    const dislikedCount = dislikedEntry?.count || 0;
    const likedRate = likedCount / likedTotal;
    const dislikedRate = dislikedCount / dislikedTotal;
    return {
      feature: likedEntry?.feature || dislikedEntry?.feature || key,
      likedCount,
      likedRate: Number(likedRate.toFixed(3)),
      dislikedCount,
      dislikedRate: Number(dislikedRate.toFixed(3)),
      likedMinusDisliked: Number((likedRate - dislikedRate).toFixed(3)),
    };
  })
    .filter(row => row.likedCount + row.dislikedCount >= 3)
    .sort((left, right) => right.likedMinusDisliked - left.likedMinusDisliked || (right.likedCount + right.dislikedCount) - (left.likedCount + left.dislikedCount))
    .slice(0, 20);
}

function buildPreferenceContrast(mongo) {
  const liked = activeRegionalPreferenceCompanies(mongo, "liked");
  const disliked = activeRegionalPreferenceCompanies(mongo, "disliked");
  const roleFamilies = [
    ["Full stack", /full[ -]?stack/i],
    ["Backend", /back[ -]?end/i],
    ["Frontend", /front[ -]?end/i],
    ["Mobile", /mobile|ios|android/i],
    ["Data", /data|analytics|machine learning|\bai\b/i],
    ["DevOps / platform", /devops|platform|cloud|sre/i],
    ["QA / testing", /quality assurance|\bqa\b|testing/i],
    ["Security", /security|cyber/i],
  ];
  const roleFeatures = company => {
    const text = [...(company.tracks || []), ...(company.jobs || []).map(job => job.title || "")].join(" ");
    return roleFamilies.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  };
  return {
    scope: "Active liked/disliked companies with explicit Costa Rica or LATAM evidence; each company counts once per feature.",
    likedCompanies: liked.length,
    dislikedCompanies: disliked.length,
    models: comparePreferenceFeatures(liked, disliked, company => [company.model || "unknown"]),
    tracks: comparePreferenceFeatures(liked, disliked, company => company.tracks || []),
    roleFamilies: comparePreferenceFeatures(liked, disliked, roleFeatures),
    usage: "Use as a soft source-priority signal. Do not reject a company on preferences alone or weaken the location/evidence gate.",
  };
}

function matchesFor(index, candidate) {
  const matches = new Map();
  for (const name of companyNames(candidate)) {
    const match = index.names.get(nameKey(name));
    if (match) matches.set(recordKey(match.company), { ...match, reason: "normalized name or alias" });
  }
  const domain = companyDomain(candidate.website || candidate.domain);
  if (domain) {
    const match = index.domains.get(domain);
    if (match) matches.set(recordKey(match.company), { ...match, reason: "official root domain" });
  }
  return { domain, matches: [...matches.values()] };
}

function laneFor(candidate) {
  return String(candidate.queryLane || candidate.lane || candidate.searchLane || "unspecified").trim() || "unspecified";
}

function sourceUrlFor(candidate) {
  return candidate.sourceUrl || candidate.source || candidate.careersUrl || candidate.website || "";
}

function recommendationFor(lanes) {
  return Object.entries(lanes)
    .map(([lane, stats]) => ({ lane, ...stats, uniqueRate: stats.leads ? Number((stats.unique / stats.leads).toFixed(3)) : 0 }))
    .sort((left, right) => right.uniqueRate - left.uniqueRate || right.unique - left.unique)
    .map(item => ({
      lane: item.lane,
      leads: item.leads,
      unique: item.unique,
      duplicateRate: Number((1 - item.uniqueRate).toFixed(3)),
      recommendation: item.leads >= 20 && item.uniqueRate < 0.15 ? "pause lane; switch industry or ATS source" : "continue or expand this lane",
    }));
}

async function main() {
  const runStartedAt = performance.now();
  const timingsMs = {};
  const options = parseArgs(process.argv.slice(2));
  const inputPaths = (options.inputs || []).map(input => path.resolve(input));
  if (options.help || !inputPaths.length) { usage(); if (!inputPaths.length && !options.help) process.exitCode = 2; return; }
  let stageStartedAt = performance.now();
  const inputDocuments = await Promise.all(inputPaths.map(async inputPath => {
    const input = await readJson(inputPath);
    if (!input) throw new Error(`Input file not found: ${inputPath}`);
    return { inputPath, input, candidates: getCompanies(input) };
  }));
  timingsMs.inputReadMs = Math.round(performance.now() - stageStartedAt);
  const inputRows = inputDocuments.flatMap(document => document.candidates.map(candidate => ({
    candidate,
    sourceFile: path.relative(root, document.inputPath),
  })));
  const inputCandidates = inputRows.map(row => row.candidate);
  if (!inputCandidates.length) throw new Error("The input must contain candidate rows with names and official websites/domains.");

  if (options.filesOnly && options.snapshotIn) throw new Error("--snapshot-in cannot be combined with --files-only.");
  stageStartedAt = performance.now();
  const mongo = options.filesOnly ? { companies: [], preferences: [], available: false } : await loadMongoCatalog(options.snapshotIn);
  timingsMs.mongoLoadOrSnapshotReadMs = Math.round(performance.now() - stageStartedAt);
  if (options.snapshotOut && mongo.available && !options.snapshotIn) {
    stageStartedAt = performance.now();
    const snapshotPath = path.resolve(options.snapshotOut);
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    const snapshot = { capturedOn: today, companies: mongo.companies, preferences: mongo.preferences };
    const temporaryPath = path.join(os.tmpdir(), `company-snapshot-${process.pid}-${Date.now()}.json`);
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, "utf8");
      await fs.copyFile(temporaryPath, snapshotPath);
    } finally { await fs.rm(temporaryPath, { force: true }); }
    timingsMs.snapshotWriteMs = Math.round(performance.now() - stageStartedAt);
  }
  stageStartedAt = performance.now();
  const bundled = await loadBundledCatalog();
  timingsMs.bundledCatalogReadMs = Math.round(performance.now() - stageStartedAt);
  // Mongo or its saved snapshot already contains completed imports. Scanning
  // every discovery/verification JSON in company-batches would parse hundreds
  // of irrelevant files on every run and add duplicate I/O. Only use batch
  // files as the fallback exclusion source when Mongo is unavailable.
  stageStartedAt = performance.now();
  const previousBatches = mongo.available ? [] : await loadPreviousBatches();
  timingsMs.previousBatchReadMs = Math.round(performance.now() - stageStartedAt);
  const index = { names: new Map(), domains: new Map() };
  stageStartedAt = performance.now();
  for (const company of [...bundled, ...mongo.companies, ...previousBatches]) addToIndex(index, company, "catalog or prior batch");
  timingsMs.indexBuildMs = Math.round(performance.now() - stageStartedAt);

  const laneStats = {};
  const uniqueCandidates = [];
  const ledgerEntries = [];
  stageStartedAt = performance.now();
  for (const { candidate, sourceFile } of inputRows) {
    const name = String(candidate?.name || candidate?.company?.name || "").trim();
    const company = candidate?.company && typeof candidate.company === "object" ? { ...candidate.company, ...candidate } : candidate;
    const candidateName = String(company?.name || name).trim();
    const lane = laneFor(candidate || {});
    const stats = laneStats[lane] ||= { leads: 0, unique: 0, duplicates: 0, missingIdentity: 0 };
    stats.leads += 1;
    if (!candidateName || (!(company.website || company.domain) && !options.namesOnly)) {
      stats.missingIdentity += 1;
      ledgerEntries.push({ company: candidateName || null, domain: companyDomain(company.website || company.domain) || null, queryLane: lane, sourceFile, status: "lead", reason: "missing company name or official website/domain", sourceUrl: sourceUrlFor(candidate || {}) });
      continue;
    }
    const result = matchesFor(index, company);
    if (result.matches.length) {
      stats.duplicates += 1;
      const first = result.matches[0];
      ledgerEntries.push({ company: candidateName, domain: result.domain || null, queryLane: lane, sourceFile, status: "duplicate", reason: first.reason, matchedCompany: first.company.name || null, matchedSource: first.source, sourceUrl: sourceUrlFor(candidate) });
      continue;
    }
    stats.unique += 1;
    uniqueCandidates.push({ ...company, queryLane: lane, ...(options.namesOnly ? { needsOfficialDomainResolution: true } : {}) });
    addToIndex(index, company, "same lead cohort");
    ledgerEntries.push({
      company: candidateName,
      domain: result.domain || null,
      queryLane: lane,
      sourceFile,
      status: "lead",
      reason: options.namesOnly && !result.domain
        ? "unique by normalized name; resolve the official domain and run full dedupe before import"
        : "unique against catalog, previous batches, and this cohort",
      sourceUrl: sourceUrlFor(candidate),
    });
  }
  timingsMs.candidateCompareMs = Math.round(performance.now() - stageStartedAt);

  const firstInput = inputDocuments[0];
  const firstInputBase = path.basename(firstInput.inputPath, path.extname(firstInput.inputPath));
  const cohortId = String(options.cohort || firstInput.input.cohortId || firstInput.input.batchId || firstInputBase).trim();
  const outputPath = path.resolve(options.out || path.join(path.dirname(firstInput.inputPath), `${firstInputBase}-unique.json`));
  const ledgerPath = path.resolve(options.ledger || path.join(path.dirname(firstInput.inputPath), `${firstInputBase}-dedupe-ledger.json`));
  stageStartedAt = performance.now();
  const likeBaseline = mongo.available ? buildPreferenceBaseline(mongo, "liked") : null;
  const dislikeBaseline = mongo.available ? buildPreferenceBaseline(mongo, "disliked") : null;
  const preferenceContrast = mongo.available ? buildPreferenceContrast(mongo) : null;
  timingsMs.preferenceAnalysisMs = Math.round(performance.now() - stageStartedAt);
  const output = {
    cohortId,
    generatedOn: today,
    catalog: {
      source: mongo.available ? `${mongo.snapshotSource} + bundled files` : "bundled files + prior batches",
      mongoCompanies: mongo.companies.length,
      bundledCompanies: bundled.length,
      priorBatchCompanies: previousBatches.length,
      indexedNames: index.names.size,
      indexedDomains: index.domains.size,
    },
    likeBaseline,
    dislikeBaseline,
    preferenceContrast,
    candidates: uniqueCandidates.slice(0, options.limit),
    uniqueCandidatesFound: uniqueCandidates.length,
    outputLimit: options.limit,
  };
  output.timingsMs = timingsMs;
  const ledger = {
    cohortId,
    checkedOn: today,
    inputFiles: inputPaths.map(inputPath => path.relative(root, inputPath)),
    inputCount: inputCandidates.length,
    uniqueCount: uniqueCandidates.length,
    outputCount: output.candidates.length,
    duplicateCount: ledgerEntries.filter(entry => entry.status === "duplicate").length,
    missingIdentityCount: ledgerEntries.filter(entry => entry.status === "lead").length - uniqueCandidates.length,
    catalog: output.catalog,
    likeBaseline: output.likeBaseline,
    dislikeBaseline: output.dislikeBaseline,
    preferenceContrast: output.preferenceContrast,
    queryLanes: recommendationFor(laneStats),
    timingsMs,
    entries: ledgerEntries,
  };
  timingsMs.preReportWriteElapsedMs = Math.round(performance.now() - runStartedAt);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  console.log(`${inputCandidates.length} candidates from ${inputPaths.length} file(s) compared in one local pass.`);
  console.log(`${ledger.duplicateCount} duplicates removed; ${uniqueCandidates.length} unique leads found; wrote ${output.candidates.length} to ${path.relative(root, outputPath)}.`);
  console.log(`Catalog index: ${index.names.size} names/aliases and ${index.domains.size} official root domains from ${output.catalog.source}.`);
  if (mongo.available) console.log(`Catalog comparison used one ${mongo.snapshotSource.toLowerCase()} for the whole lead pool.`);
  console.log(`Dedupe timings (ms): ${JSON.stringify({ ...timingsMs, processElapsedMs: Math.round(performance.now() - runStartedAt) })}.`);
  if (output.likeBaseline) console.log(`Active regional preferences for strategy: ${output.likeBaseline.activeLikedWithCostaRicaOrLatamEvidence} likes; ${output.dislikeBaseline.activeDislikedWithCostaRicaOrLatamEvidence} dislikes.`);
  console.log(`Dedupe ledger: ${path.relative(root, ledgerPath)}`);
  for (const lane of ledger.queryLanes) console.log(`  ${lane.lane}: ${lane.unique}/${lane.leads} unique (${lane.recommendation}).`);
  if (!mongo.available) console.log("MongoDB was unavailable; this run used bundled records and prior batch files. Set MONGODB_URI for the complete catalog pass.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
