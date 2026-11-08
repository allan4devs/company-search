#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fetchers = new Set([
  "fetch-alpunto-software-leads",
  "fetch-aworkado-company-leads",
  "fetch-camtic-company-leads",
  "fetch-cinde-digital-leads",
  "fetch-costa-rica-directory-leads",
  "fetch-enterprise-league-leads",
  "fetch-findremote-latam-engineering-leads",
  "fetch-globallyremote-company-leads",
  "fetch-himalayas-company-leads",
  "fetch-jobicy-regional-engineering-leads",
  "fetch-nearshore-directory-leads",
  "fetch-nearshorehub-company-leads",
  "fetch-proveedores-software-leads",
  "fetch-regional-software-leads",
]);
const defaultSources = [
  "fetch-alpunto-software-leads",
  "fetch-cinde-digital-leads",
  "fetch-costa-rica-directory-leads",
  "fetch-himalayas-company-leads",
  "fetch-nearshore-directory-leads",
  "fetch-proveedores-software-leads",
];
const pausedSources = new Map([
  ["fetch-camtic-company-leads", "prior fit-and-location pass was 2/60"],
  ["fetch-findremote-latam-engineering-leads", "prior source pass had no verified first-party location matches"],
  ["fetch-nearshorehub-company-leads", "prior strict pass was 2/31"],
]);
const sourceArgs = new Map([
  ["fetch-costa-rica-directory-leads", ["--sources", "camscat"]],
]);

function usage() {
  console.log("Usage: node scripts/collect-and-dedupe-company-leads.mjs [--source fetcher-name ...] [--input leads.json ...] [--cohort id] [--out-dir path] [--source-concurrency 3] [--profile-resolve-concurrency 24] [--resolve-concurrency 8] [--domain-search-budget N] [--domain-search-engine both|bing|ddg] [--no-domain-cache] [--verify-concurrency 24] [--target 100] [--limit 1000] [--import]");
  console.log("Runs selected fetchers concurrently, bulk-dedupes names, resolves and verifies unique-site slices, then stops at the verified target.");
  console.log("Default sources are Costa Rica-focused: Alpunto, CINDE, CAMSCAT, Himalayas CR roles, nearshore CR, and software providers. Pass --source to choose a custom mix.");
  console.log("Add --input for an already collected directory or Manifest lead file. Use --wikidata-only to avoid per-name search fallback when speed matters more than site-resolution coverage.");
  console.log("Use --domain-search-budget N to cap live per-company domain searches across the entire run; a bounded run defaults to Bing-only. Set --domain-search-engine both to include the slower fallback. Skipped candidates remain in the output for manual review. Domain candidates are cached between runs by default; use --no-domain-cache for a clean benchmark.");
  console.log("It shapes and prepares the verified target. Pass --import to dry-run, then import the prepared batch to COMPANY_IMPORT_BASE_URL or localhost:3000.");
  console.log("The following previously low-yield sources are paused by default: CAMTIC, FindRemote, Nearshore Hub. Choose one explicitly to retry it.");
}

function parseArgs(args) {
  const options = {
    sources: [],
    inputs: [],
    sourceConcurrency: 3,
    sourceTimeout: 120000,
    profileResolveConcurrency: 24,
    resolveConcurrency: 8,
    domainSearchBudget: undefined,
    domainSearchEngine: undefined,
    noDomainCache: false,
    verifyConcurrency: 24,
    sliceSize: 200,
    maxPages: 2,
    target: 100,
    import: false,
    limit: 1000,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--wikidata-only") { options.wikidataOnly = true; continue; }
    if (arg === "--import") { options.import = true; continue; }
    if (arg === "--no-domain-cache") { options.noDomainCache = true; continue; }
    if (["--source", "--input", "--cohort", "--out-dir", "--source-concurrency", "--source-timeout", "--profile-resolve-concurrency", "--resolve-concurrency", "--domain-search-budget", "--domain-search-engine", "--verify-concurrency", "--slice-size", "--max-pages", "--target", "--limit"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--source") options.sources.push(...value.split(",").map(item => item.trim()).filter(Boolean));
      else if (arg === "--input") options.inputs.push(value);
      else if (arg === "--cohort") options.cohort = value;
      else if (arg === "--out-dir") options.outDir = value;
      else if (arg === "--source-concurrency") options.sourceConcurrency = Number(value);
      else if (arg === "--source-timeout") options.sourceTimeout = Number(value);
      else if (arg === "--profile-resolve-concurrency") options.profileResolveConcurrency = Number(value);
      else if (arg === "--resolve-concurrency") options.resolveConcurrency = Number(value);
      else if (arg === "--domain-search-budget") options.domainSearchBudget = Number(value);
      else if (arg === "--domain-search-engine") options.domainSearchEngine = value.toLowerCase();
      else if (arg === "--verify-concurrency") options.verifyConcurrency = Number(value);
      else if (arg === "--slice-size") options.sliceSize = Number(value);
      else if (arg === "--max-pages") options.maxPages = Number(value);
      else if (arg === "--target") options.target = Number(value);
      else options.limit = Number(value);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  options.sources = [...new Set(options.sources.length ? options.sources : options.inputs.length ? [] : defaultSources)];
  options.domainSearchEngine ||= options.domainSearchBudget === undefined ? "both" : "bing";
  if (!Number.isInteger(options.sourceConcurrency) || options.sourceConcurrency < 1 || options.sourceConcurrency > 8) throw new Error("--source-concurrency must be between 1 and 8.");
  if (!Number.isInteger(options.sourceTimeout) || options.sourceTimeout < 10000) throw new Error("--source-timeout must be at least 10000 milliseconds.");
  if (!Number.isInteger(options.profileResolveConcurrency) || options.profileResolveConcurrency < 1 || options.profileResolveConcurrency > 40) throw new Error("--profile-resolve-concurrency must be between 1 and 40.");
  if (!Number.isInteger(options.resolveConcurrency) || options.resolveConcurrency < 1 || options.resolveConcurrency > 20) throw new Error("--resolve-concurrency must be between 1 and 20.");
  if (options.domainSearchBudget !== undefined && (!Number.isInteger(options.domainSearchBudget) || options.domainSearchBudget < 0 || options.domainSearchBudget > 1000)) throw new Error("--domain-search-budget must be between 0 and 1000.");
  if (!["both", "bing", "ddg"].includes(options.domainSearchEngine)) throw new Error("--domain-search-engine must be both, bing, or ddg.");
  if (!Number.isInteger(options.verifyConcurrency) || options.verifyConcurrency < 1 || options.verifyConcurrency > 30) throw new Error("--verify-concurrency must be between 1 and 30.");
  if (!Number.isInteger(options.sliceSize) || options.sliceSize < 1 || options.sliceSize > 200) throw new Error("--slice-size must be between 1 and 200.");
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1 || options.maxPages > 3) throw new Error("--max-pages must be between 1 and 3.");
  if (!Number.isInteger(options.target) || options.target < 1 || options.target > 1000) throw new Error("--target must be between 1 and 1000.");
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1000) throw new Error("--limit must be between 1 and 1000.");
  for (const source of options.sources) if (!fetchers.has(source.replace(/\.mjs$/i, ""))) throw new Error(`Unsupported fetcher: ${source}. Choose an installed fetch-*.mjs script.`);
  return options;
}

function runNode(scriptPath, args, label, timeoutMs = 0, env = process.env) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    let stderr = "";
    let stdout = "";
    let timedOut = false;
    const timeout = timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs) : undefined;
    child.stdout.on("data", chunk => { stdout += chunk.toString(); process.stdout.write(`[${label}] ${chunk}`); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on("close", code => {
      if (timeout) clearTimeout(timeout);
      if (code === 0) resolve({ elapsedMs: Math.round(performance.now() - startedAt), stdout });
      else reject(new Error(timedOut ? `timed out after ${timeoutMs} ms` : `exit ${code}: ${stderr.trim().slice(-1600)}`));
    });
  });
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const results = Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function readCandidates(filePath) {
  const input = JSON.parse(await fs.readFile(filePath, "utf8"));
  const candidates = Array.isArray(input) ? input : input.candidates || input.leads || input.companies || [];
  return (Array.isArray(candidates) ? candidates : []).filter(candidate => candidate && typeof candidate.name === "string" && candidate.name.trim());
}

async function readDocument(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function normalizedName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasWebsiteCandidate(candidate) {
  const proposed = typeof candidate.websiteCandidate === "string" ? candidate.websiteCandidate : candidate.websiteCandidate?.url;
  return Boolean(candidate.website || candidate.domain || proposed);
}

function strictVerified(candidate) {
  return candidate.officialIdentityVerified !== false
    && candidate.likelyFit === true
    && Boolean(candidate.localPresenceVerified || candidate.regionalWorkEligibilityVerified || candidate.regionalPresenceVerified);
}

async function verifyLatestBatch(baseUrl) {
  const startedAt = performance.now();
  const pages = await Promise.all([1, 2, 3].map(async page => {
    const url = new URL(`/api/comp/catalog?group=companies&tab=latest-batch&page=${page}&pageSize=48`, baseUrl);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Catalog API HTTP ${response.status} on page ${page}.`);
    return response.json();
  }));
  const companies = pages.flatMap(page => page.companies || []);
  return {
    elapsedMs: Math.round(performance.now() - startedAt),
    total: pages[0]?.total ?? null,
    retrieved: companies.length,
    taggedNew: companies.filter(company => company.tags?.includes("new")).length,
    uniqueNames: new Set(companies.map(company => normalizedName(company.name))).size,
  };
}

async function main() {
  const totalStartedAt = performance.now();
  const stageTimingsMs = {};
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { usage(); return; }

  const cohort = options.cohort || `fast-search-${getCostaRicaDate()}-${Date.now()}`;
  const outDir = path.resolve(root, options.outDir || path.join("company-batches", cohort));
  await fs.mkdir(outDir, { recursive: true });
  if ((await fs.readdir(outDir)).length) throw new Error(`Output directory is not empty; choose a fresh --out-dir to preserve existing files: ${path.relative(root, outDir)}`);
  const configuredSources = options.sources.map(source => source.replace(/\.mjs$/i, ""));
  for (const source of configuredSources) {
    const reason = pausedSources.get(source);
    if (reason) console.log(`Source selected for retry: ${source} (${reason}).`);
  }

  console.log(`Collecting from ${configuredSources.length} source fetchers with at most ${options.sourceConcurrency} source processes in flight.`);
  let stageStartedAt = performance.now();
  const sourceResults = await runPool(configuredSources, options.sourceConcurrency, async source => {
    const output = path.join(outDir, `${source}.json`);
    const script = path.join(root, "scripts", `${source}.mjs`);
    try {
      const execution = await runNode(script, [...(sourceArgs.get(source) || []), "--out", output], source, options.sourceTimeout);
      return { source, output, ok: true, elapsedMs: execution.elapsedMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${source}] ${message}`);
      return { source, output, ok: false, error: message };
    }
  });
  stageTimingsMs.sourceFetchWallMs = Math.round(performance.now() - stageStartedAt);
  stageTimingsMs.sourceFetchSumMs = sourceResults.reduce((sum, result) => sum + (result.elapsedMs || 0), 0);
  const completedSources = sourceResults.filter(result => result.ok);
  if (!completedSources.length && !options.inputs.length) throw new Error("No source fetcher completed successfully, and no --input files were provided.");

  const inputPaths = options.inputs.map(input => path.resolve(root, input));
  stageStartedAt = performance.now();
  const documents = await Promise.all([
    ...completedSources.map(async result => ({ path: result.output, candidates: await readCandidates(result.output) })),
    ...inputPaths.map(async inputPath => ({ path: inputPath, candidates: await readCandidates(inputPath) })),
  ]);
  const leads = documents.flatMap(document => document.candidates.map(candidate => ({
    ...candidate,
    queryLane: candidate.queryLane || path.basename(document.path, ".json"),
    sourceUrl: candidate.sourceUrl || candidate.source || "",
    sourceFile: path.relative(root, document.path),
  })));
  if (!leads.length) throw new Error("The completed sources and input files contained no named company leads.");

  const rawPath = path.join(outDir, "combined-raw-leads.json");
  await fs.writeFile(rawPath, `${JSON.stringify({ cohortId: cohort, generatedOn: getCostaRicaDate(), sourceFiles: documents.map(document => path.relative(root, document.path)), candidates: leads }, null, 2)}\n`, "utf8");
  stageTimingsMs.inputReadMergeWriteMs = Math.round(performance.now() - stageStartedAt);
  const uniquePath = path.join(outDir, "name-unique-leads.json");
  const snapshotPath = path.join(outDir, "mongo-snapshot.json");
  const ledgerPath = path.join(outDir, "name-dedupe-ledger.json");
  const deduper = path.join(root, "scripts", "dedupe-company-candidates.mjs");
  stageStartedAt = performance.now();
  const nameDedupeExecution = await runNode(deduper, [
    rawPath,
    "--names-only",
    "--snapshot-out", snapshotPath,
    "--out", uniquePath,
    "--ledger", ledgerPath,
    "--cohort", cohort,
    "--limit", String(options.limit),
  ], "bulk-dedupe");
  stageTimingsMs.nameDedupeProcessMs = nameDedupeExecution.elapsedMs;

  stageStartedAt = performance.now();
  const nameUniqueDoc = await readDocument(uniquePath);
  const uniqueCandidates = Array.isArray(nameUniqueDoc) ? nameUniqueDoc : nameUniqueDoc.candidates || [];
  const snapshot = await readDocument(snapshotPath).catch(() => null);
  stageTimingsMs.readNameUniqueAndSnapshotMs = Math.round(performance.now() - stageStartedAt);
  if (!snapshot || !Array.isArray(snapshot.companies) || !Array.isArray(snapshot.preferences)) {
    throw new Error("Mongo snapshot was not created. Set MONGODB_URI so this cohort can use one complete catalog snapshot.");
  }

  const strictCandidates = [];
  const sliceReports = [];
  const strictPoolPath = path.join(outDir, "strict-verified-pool.json");
  const strictUniquePath = path.join(outDir, "strict-domain-unique-leads.json");
  const strictLedgerPath = path.join(outDir, "strict-domain-dedupe-ledger.json");
  const profileResolver = path.join(root, "scripts", "resolve-directory-profiles.mjs");
  const resolver = path.join(root, "scripts", "resolve-company-domains.mjs");
  const verifier = path.join(root, "scripts", "verify-company-leads.mjs");
  let finalUniqueCount = 0;
  let remainingDomainSearchBudget = options.domainSearchBudget;

  for (let offset = 0, sliceIndex = 0; offset < uniqueCandidates.length; offset += options.sliceSize, sliceIndex += 1) {
    const slice = uniqueCandidates.slice(offset, offset + options.sliceSize);
    const sliceId = String(sliceIndex + 1).padStart(3, "0");
    const needsProfileResolution = slice.filter(candidate => !hasWebsiteCandidate(candidate) && (candidate.directoryProfileUrl || candidate.profileUrl));
    let profileResolved = [];
    let profileResolveProcessMs = 0;
    if (needsProfileResolution.length) {
      const profileInputPath = path.join(outDir, `site-slice-${sliceId}-profile-input.json`);
      const profileResolvedPath = path.join(outDir, `site-slice-${sliceId}-profiles-resolved.json`);
      await fs.writeFile(profileInputPath, `${JSON.stringify({ cohortId: cohort, candidates: needsProfileResolution }, null, 2)}\n`, "utf8");
      const profileExecution = await runNode(profileResolver, [
        profileInputPath,
        "--concurrency", String(options.profileResolveConcurrency),
        "--out", profileResolvedPath,
      ], `profile-resolve-${sliceIndex + 1}`);
      profileResolveProcessMs = profileExecution.elapsedMs;
      const profileResolvedDoc = await readDocument(profileResolvedPath);
      profileResolved = Array.isArray(profileResolvedDoc) ? profileResolvedDoc : profileResolvedDoc.candidates || [];
    }

    const profileResolvedByName = new Map(profileResolved.map(candidate => [normalizedName(candidate.name), candidate]));
    const profileResolvedSlice = slice.map(candidate => profileResolvedByName.get(normalizedName(candidate.name)) || candidate);
    const needsResolution = profileResolvedSlice.filter(candidate => !hasWebsiteCandidate(candidate));
    let resolved = [];
    let resolvedDoc = {};
    let resolverProcessMs = 0;
    if (needsResolution.length) {
      const resolverInputPath = path.join(outDir, `site-slice-${sliceId}-needs-domain.json`);
      const resolvedPath = path.join(outDir, `site-slice-${sliceId}-resolved.json`);
      await fs.writeFile(resolverInputPath, `${JSON.stringify({ cohortId: cohort, candidates: needsResolution, preferenceContrast: nameUniqueDoc.preferenceContrast || null }, null, 2)}\n`, "utf8");
      const resolverArgs = [resolverInputPath, "--region", "Latin America", "--concurrency", String(options.resolveConcurrency), "--out", resolvedPath];
      resolverArgs.push("--search-engine", options.domainSearchEngine);
      if (options.wikidataOnly) resolverArgs.push("--wikidata-only");
      if (remainingDomainSearchBudget !== undefined) resolverArgs.push("--search-budget", String(remainingDomainSearchBudget));
      if (options.noDomainCache) resolverArgs.push("--no-cache");
      const resolverExecution = await runNode(resolver, resolverArgs, `resolve-${sliceIndex + 1}`);
      resolverProcessMs = resolverExecution.elapsedMs;
      resolvedDoc = await readDocument(resolvedPath);
      resolved = Array.isArray(resolvedDoc) ? resolvedDoc : resolvedDoc.candidates || [];
      if (remainingDomainSearchBudget !== undefined) {
        remainingDomainSearchBudget = Math.max(0, remainingDomainSearchBudget - (resolvedDoc.perNameSearchCount || 0));
      }
    }

    const resolvedByName = new Map(resolved.map(candidate => [normalizedName(candidate.name), candidate]));
    const verifyCandidates = profileResolvedSlice.map(candidate => resolvedByName.get(normalizedName(candidate.name)) || candidate);
    const verifyInputPath = path.join(outDir, `site-slice-${sliceId}-verify-input.json`);
    const verifiedPath = path.join(outDir, `site-slice-${sliceId}-verified.json`);
    await fs.writeFile(verifyInputPath, `${JSON.stringify({ cohortId: cohort, candidates: verifyCandidates }, null, 2)}\n`, "utf8");
    const verifyExecution = await runNode(verifier, [
      verifyInputPath,
      "--concurrency", String(options.verifyConcurrency),
      "--max-pages", String(options.maxPages),
      "--limit", String(slice.length),
      "--out", verifiedPath,
    ], `verify-${sliceIndex + 1}`);
    const verifiedDoc = await readDocument(verifiedPath);
    const verified = Array.isArray(verifiedDoc) ? verifiedDoc : verifiedDoc.candidates || [];
    const strict = verified.filter(strictVerified);
    const siteReadyCount = verifyCandidates.filter(hasWebsiteCandidate).length;
    strictCandidates.push(...strict);
    sliceReports.push({
      offset,
      input: slice.length,
      directoryProfileResolutionNeeded: needsProfileResolution.length,
      directoryProfileSitesFound: profileResolved.filter(hasWebsiteCandidate).length,
      profileResolveProcessMs,
      websiteResolutionNeeded: needsResolution.length,
      resolvedWithWebsiteCandidate: resolved.filter(hasWebsiteCandidate).length,
      fallbackResolveProcessMs: resolverProcessMs,
      domainResolutionCacheHits: resolvedDoc?.cacheHitCount ?? 0,
      domainResolutionCacheMisses: resolvedDoc?.cacheMissCount ?? 0,
      perNameDomainSearches: resolvedDoc?.perNameSearchCount ?? 0,
      deferredDomainSearches: resolvedDoc?.deferredSearchCount ?? 0,
      domainResolutionTimingsMs: resolvedDoc?.timingsMs ?? null,
      remainingDomainSearchBudget: remainingDomainSearchBudget ?? null,
      siteReadyCandidates: siteReadyCount,
      resolverProcessMs,
      verifierProcessMs: verifyExecution.elapsedMs,
      officialPagesChecked: verifiedDoc.officialPagesChecked ?? null,
      elapsedMs: verifiedDoc.elapsedMs ?? null,
      strictPasses: strict.length,
      queryLanes: verifiedDoc.queryLanes || [],
      verificationFile: path.relative(root, verifiedPath),
    });

    stageStartedAt = performance.now();
    await fs.writeFile(strictPoolPath, `${JSON.stringify({ cohortId: cohort, generatedOn: getCostaRicaDate(), candidates: strictCandidates }, null, 2)}\n`, "utf8");
    const strictPoolWriteMs = Math.round(performance.now() - stageStartedAt);
    let domainDedupeProcessMs = 0;
    if (strictCandidates.length) {
      const domainDedupeExecution = await runNode(deduper, [
        strictPoolPath,
        "--snapshot-in", snapshotPath,
        "--out", strictUniquePath,
        "--ledger", strictLedgerPath,
        "--cohort", cohort,
        "--limit", String(options.limit),
      ], `domain-dedupe-${sliceIndex + 1}`);
      domainDedupeProcessMs = domainDedupeExecution.elapsedMs;
      const strictUniqueDoc = await readDocument(strictUniquePath);
      finalUniqueCount = (Array.isArray(strictUniqueDoc) ? strictUniqueDoc : strictUniqueDoc.candidates || []).length;
    }
    sliceReports.at(-1).strictPoolWriteMs = strictPoolWriteMs;
    sliceReports.at(-1).domainDedupeProcessMs = domainDedupeProcessMs;
    stageTimingsMs.websiteResolutionSumMs = (stageTimingsMs.websiteResolutionSumMs || 0) + profileResolveProcessMs + resolverProcessMs;
    stageTimingsMs.directoryProfileResolutionSumMs = (stageTimingsMs.directoryProfileResolutionSumMs || 0) + profileResolveProcessMs;
    stageTimingsMs.fallbackDomainResolutionSumMs = (stageTimingsMs.fallbackDomainResolutionSumMs || 0) + resolverProcessMs;
    stageTimingsMs.websiteVerificationProcessSumMs = (stageTimingsMs.websiteVerificationProcessSumMs || 0) + verifyExecution.elapsedMs;
    stageTimingsMs.websiteVerificationInternalSumMs = (stageTimingsMs.websiteVerificationInternalSumMs || 0) + (verifiedDoc.elapsedMs || 0);
    stageTimingsMs.finalDomainDedupeProcessSumMs = (stageTimingsMs.finalDomainDedupeProcessSumMs || 0) + domainDedupeProcessMs;
    stageTimingsMs.strictPoolWriteSumMs = (stageTimingsMs.strictPoolWriteSumMs || 0) + strictPoolWriteMs;
    console.log(`Strict unique total after slice ${sliceIndex + 1}: ${finalUniqueCount}/${options.target}.`);
    if (finalUniqueCount >= options.target) break;
  }

  if (!strictCandidates.length) {
    await fs.writeFile(strictUniquePath, `${JSON.stringify({ cohortId: cohort, generatedOn: getCostaRicaDate(), candidates: [] }, null, 2)}\n`, "utf8");
  }

  const batchArtifacts = {};
  if (finalUniqueCount >= options.target) {
    const reviewManifestPath = path.join(outDir, "review-manifest.json");
    const shapedPath = path.join(outDir, "shaped-candidates.json");
    const preparedPath = path.join(outDir, `${cohort}.json`);
    const preparedLedgerPath = path.join(outDir, "import-ledger.json");
    await fs.writeFile(reviewManifestPath, `${JSON.stringify({ cohortId: cohort, checkedOn: getCostaRicaDate(), excludeNames: [], includeNames: [], overrides: {} }, null, 2)}\n`, "utf8");

    stageStartedAt = performance.now();
    const shapeExecution = await runNode(path.join(root, "scripts", "shape-company-batch.mjs"), [strictUniquePath, reviewManifestPath, "--out", shapedPath], "shape-batch");
    stageTimingsMs.shapingProcessMs = shapeExecution.elapsedMs;
    batchArtifacts.shapedCandidates = path.relative(root, shapedPath);

    stageStartedAt = performance.now();
    const prepareExecution = await runNode(path.join(root, "scripts", "prepare-company-batch.mjs"), [
      shapedPath,
      "--batch-id", cohort,
      "--out", preparedPath,
      "--ledger", preparedLedgerPath,
      "--limit", "100",
    ], "prepare-batch");
    stageTimingsMs.prepareProcessMs = prepareExecution.elapsedMs;
    const preparedDoc = await readDocument(preparedPath);
    const preparedCount = Array.isArray(preparedDoc.companies) ? preparedDoc.companies.length : 0;
    batchArtifacts.preparedBatch = path.relative(root, preparedPath);
    batchArtifacts.preparedCompanies = preparedCount;
    batchArtifacts.preparedLedger = path.relative(root, preparedLedgerPath);
    if (preparedCount !== 100) throw new Error(`Prepared batch has ${preparedCount} companies; exactly 100 are required before import.`);

    const importer = path.join(root, "scripts", "import-company-batches.mjs");
    stageStartedAt = performance.now();
    const dryRun = await runNode(importer, [preparedPath, "--dry-run"], "import-dry-run");
    stageTimingsMs.importDryRunProcessMs = dryRun.elapsedMs;
    batchArtifacts.importDryRunOutput = dryRun.stdout.trim();

    if (options.import) {
      const importBaseUrl = "http://localhost:3000";
      const importEnv = { ...process.env, COMPANY_IMPORT_BASE_URL: importBaseUrl };
      stageStartedAt = performance.now();
      const actualImport = await runNode(importer, [preparedPath], "import", 0, importEnv);
      stageTimingsMs.importProcessMs = actualImport.elapsedMs;
      batchArtifacts.importOutput = actualImport.stdout.trim();
      batchArtifacts.importBaseUrl = importBaseUrl;

      stageStartedAt = performance.now();
      try {
        batchArtifacts.catalogVerification = await verifyLatestBatch(importBaseUrl);
        stageTimingsMs.latestBatchApiVerificationMs = batchArtifacts.catalogVerification.elapsedMs;
      } catch (error) {
        batchArtifacts.catalogVerificationError = error instanceof Error ? error.message : String(error);
        stageTimingsMs.latestBatchApiVerificationMs = Math.round(performance.now() - stageStartedAt);
      }
    }
  }

  stageTimingsMs.totalElapsedBeforeReportWriteMs = Math.round(performance.now() - totalStartedAt);
  const timingReportPath = path.join(outDir, "timing-report.json");
  const timingReport = {
    cohortId: cohort,
    generatedOn: getCostaRicaDate(),
    timingsMs: stageTimingsMs,
    sourceDurations: sourceResults.map(({ source, elapsedMs, ok, error }) => ({ source, elapsedMs: elapsedMs ?? null, ok, error: error || null })),
    verificationSlices: sliceReports,
    artifacts: batchArtifacts,
    targetUniqueCompanies: options.target,
    domainSearchBudget: options.domainSearchBudget ?? null,
    domainSearchEngine: options.domainSearchEngine,
    domainCacheEnabled: !options.noDomainCache,
    verifiedDomainUniqueCompanies: finalUniqueCount,
    imported: Boolean(options.import && batchArtifacts.importOutput),
  };
  await fs.writeFile(timingReportPath, `${JSON.stringify(timingReport, null, 2)}\n`, "utf8");

  const reportPath = path.join(outDir, "collection-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify({
    cohortId: cohort,
    generatedOn: getCostaRicaDate(),
    sourceConcurrency: options.sourceConcurrency,
    sourceResults,
    inputCount: leads.length,
    nameUniqueCount: uniqueCandidates.length,
    targetStrictUniqueCount: options.target,
    strictUniqueCount: finalUniqueCount,
    slices: sliceReports,
    timingsMs: stageTimingsMs,
    rawLeads: path.relative(root, rawPath),
    nameUniqueLeads: path.relative(root, uniquePath),
    mongoSnapshot: path.relative(root, snapshotPath),
    dedupeLedger: path.relative(root, ledgerPath),
    strictUniqueLeads: path.relative(root, strictUniquePath),
    strictDedupeLedger: strictCandidates.length ? path.relative(root, strictLedgerPath) : null,
    timingReport: path.relative(root, timingReportPath),
    artifacts: batchArtifacts,
    nextStep: options.import && batchArtifacts.importOutput ? "Review the imported companies in the New view; the import pipeline verifies the current batch separately." : finalUniqueCount >= options.target ? "Review the prepared 100-company file, then import it if desired." : "Add fresh sources or inputs; this run exhausted the available name-unique candidates before reaching the target.",
  }, null, 2)}\n`, "utf8");
  console.log(`Collection complete: ${leads.length} leads produced ${uniqueCandidates.length} name-unique candidates and ${finalUniqueCount} verified, domain-unique leads.`);
  console.log(`Raw leads, reusable Mongo snapshot, verification slices, and unique shortlist are in ${path.relative(root, outDir)}.`);
  console.log(`Step timings are in ${path.relative(root, timingReportPath)}; elapsed before reports: ${stageTimingsMs.totalElapsedBeforeReportWriteMs} ms.`);
  if (sourceResults.some(result => !result.ok)) console.log("Some source fetchers failed; successful sources were still combined and deduped. See collection-report.json.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
