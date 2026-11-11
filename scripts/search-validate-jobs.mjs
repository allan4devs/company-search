#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkedOn = getCostaRicaDate();
const defaults = {
  baseUrl: process.env.COMP_JOB_SEARCH_BASE_URL || "http://localhost:3000",
  target: 50,
  maxPerCompany: 4,
  concurrency: 8,
  out: `company-batches/jobs-comp-${checkedOn}.json`,
  report: `company-batches/jobs-comp-${checkedOn}-report.json`,
  import: false,
};

const rolePattern = /\b(?:software engineer|software developer|application engineer|web developer|full[\s-]?stack|back[\s-]?end|backend|front[\s-]?end|frontend|platform engineer|developer experience|site reliability engineer|\bSRE\b|devops engineer|data engineer|machine learning engineer|\bAI engineer|security engineer|cloud engineer|mobile engineer|QA automation engineer|test automation engineer|automation engineer|Java developer|Python developer|React engineer|Node(?:\.js)? engineer)\b/i;
const preferredRolePattern = /full[\s-]?stack|back[\s-]?end|backend|front[\s-]?end|frontend|software engineer|software developer|application engineer/i;
const avoidTitlePattern = /\b(?:sales|account executive|recruiter|talent acquisition|customer success|support specialist|help desk|technical writer|project manager|product manager|internship|intern|open application|general application|talent pool|talent network|future opportunities)\b/i;
const regionPattern = /\b(?:Costa\s+Rica|LATAM|Latin\s+America)\b/i;
const technologyPatterns = [
  ["Java", /\bJava\b/i], ["Spring", /\bSpring(?:\s+Boot)?\b/i],
  ["React", /\bReact(?:\.js)?\b/i], ["Next.js", /\bNext\.js\b/i],
  ["TypeScript", /\bTypeScript\b/i], ["JavaScript", /\bJavaScript\b/i],
  ["Node.js", /\bNode(?:\.js)?\b/i], ["Python", /\bPython\b/i],
];

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--import") options.import = true;
    else if (["--base-url", "--target", "--max-per-company", "--concurrency", "--out", "--report"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      const key = ({ "--base-url": "baseUrl", "--target": "target", "--max-per-company": "maxPerCompany", "--concurrency": "concurrency", "--out": "out", "--report": "report" })[arg];
      options[key] = ["target", "maxPerCompany", "concurrency"].includes(key) ? Number(value) : value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  for (const key of ["target", "maxPerCompany", "concurrency"]) {
    if (!Number.isInteger(options[key]) || options[key] < 1) throw new Error(`--${key.replace(/[A-Z]/g, x => `-${x.toLowerCase()}`)} must be a positive integer.`);
  }
  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  return options;
}

function printHelp() {
  console.log(`Search saved Comp employers' public ATS feeds for current, location-eligible engineering jobs.\n\nUsage:\n  node scripts/search-validate-jobs.mjs [--target 50] [--max-per-company 4] [--concurrency 8]\n    [--base-url http://localhost:3000] [--out path] [--report path] [--import]\n\nThe default run writes a validated review batch and report without importing. --import\nsubmits only when the exact target count passed the live ATS, role, and location checks.`);
}

function normalized(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function plainText(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/[\t\r ]+/g, " ").replace(/\n\s*/g, "\n").trim();
}

function parseAts(urlText) {
  try {
    const url = new URL(urlText);
    const parts = url.pathname.split("/").filter(Boolean);
    const host = url.hostname.toLowerCase();
    if (/^(?:job-boards|boards)\.greenhouse\.io$/.test(host)) {
      const jobIndex = parts.findIndex(part => part === "jobs");
      if (jobIndex > 0 && parts[jobIndex + 1]) return { provider: "greenhouse", board: parts[jobIndex - 1], id: parts[jobIndex + 1].split("-")[0], url: urlText };
    }
    if (host === "jobs.lever.co" && parts.length >= 2) return { provider: "lever", board: parts[0], id: parts[1], url: urlText };
    if (host === "jobs.ashbyhq.com" && parts.length >= 2) return { provider: "ashby", board: parts[0], id: parts[1], url: urlText };
    if (host === "jobs.smartrecruiters.com" && parts.length >= 2) {
      const match = parts[1].match(/^(\d{8,})/);
      if (match) return { provider: "smartrecruiters", board: parts[0], id: match[1], url: urlText };
    }
  } catch {}
  return undefined;
}

function boardKey(ats) { return `${ats.provider}:${ats.board.toLowerCase()}`; }

async function requestJson(url, { attempts = 2 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "TheCompJobValidator/1.0 (+public employer job discovery)" },
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      output[index] = await fn(values[index], index);
    }
  }));
  return output;
}

async function loadCatalog(baseUrl, concurrency) {
  const urlFor = page => `${baseUrl}/api/comp/catalog?group=companies&tab=all&page=${page}&pageSize=48&fastPageOnly=true`;
  const first = await requestJson(urlFor(1));
  const pages = await mapLimit(Array.from({ length: Math.max(0, first.pageCount - 1) }, (_, i) => i + 2), Math.min(4, concurrency), async page => requestJson(urlFor(page)));
  return [...(first.companies || []), ...pages.flatMap(page => page.companies || [])];
}

function buildBoards(companies) {
  const boards = new Map();
  const unsupported = [];
  for (const company of companies) {
    for (const job of company.jobs || []) {
      const ats = parseAts(job.url);
      if (!ats) {
        if (regionPattern.test([job.title, job.location, job.eligibility].join(" "))) unsupported.push({ company: company.name, title: job.title, url: job.url, reason: "unsupported-or-non-ATS" });
        continue;
      }
      const key = boardKey(ats);
      const current = boards.get(key) || { ...ats, companyKeys: new Set(), companyNameByKey: new Map(), refs: [] };
      current.companyKeys.add(company.key);
      current.companyNameByKey.set(company.key, company.name);
      current.refs.push({ company, job, ats });
      boards.set(key, current);
    }
  }
  return { boards: [...boards.values()], unsupported };
}

function atsFeedUrl(board) {
  const encoded = encodeURIComponent(board.board);
  if (board.provider === "greenhouse") return `https://boards-api.greenhouse.io/v1/boards/${encoded}/jobs?content=true`;
  if (board.provider === "lever") return `https://api.lever.co/v0/postings/${encoded}?mode=json`;
  if (board.provider === "ashby") return `https://api.ashbyhq.com/posting-api/job-board/${encoded}`;
  if (board.provider === "smartrecruiters") return `https://api.smartrecruiters.com/v1/companies/${encoded}/postings?limit=100&offset=0`;
  throw new Error(`Unsupported provider ${board.provider}`);
}

function normalizeFeedJob(provider, item) {
  if (provider === "greenhouse") {
    return { id: String(item.id), title: item.title || "", location: item.location?.name || "", url: item.absolute_url || "", description: plainText(item.content || ""), postedOn: item.updated_at?.slice(0, 10) };
  }
  if (provider === "lever") {
    const location = item.categories?.location || item.categories?.allLocations || "";
    return { id: String(item.id), title: item.text || "", location, url: item.hostedUrl || item.applyUrl || "", description: plainText(item.descriptionPlain || item.description || ""), postedOn: item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : undefined };
  }
  if (provider === "ashby") {
    return { id: String(item.id), title: item.title || "", location: item.location || "", url: item.jobUrl || "", description: plainText(item.descriptionPlain || item.descriptionHtml || item.description || ""), postedOn: item.publishedAt?.slice(0, 10), workplaceType: item.workplaceType || "" };
  }
  if (provider === "smartrecruiters") {
    const location = [item.location?.city, item.location?.region, item.location?.country].filter(Boolean).join(", ");
    return { id: String(item.id), title: item.name || "", location, url: item.ref || "", description: plainText(item.jobAd?.sections?.jobDescription?.text || ""), postedOn: item.releasedDate?.slice(0, 10) };
  }
  return undefined;
}

function regionalEligibility(job) {
  const currentLocation = job.location.trim();
  const direct = `${job.title} ${currentLocation}`.match(regionPattern)?.[0];
  if (direct) return { label: /costa\s+rica/i.test(direct) ? "Costa Rica" : /latam/i.test(direct) ? "LATAM" : "Latin America", evidence: currentLocation || job.title };
  const text = job.description;
  const cues = /remote|location|based|located|eligible|candidate|applicant|hire|hiring|work from|reside|country|must be/i;
  for (const match of text.matchAll(new RegExp(regionPattern.source, "ig"))) {
    const start = Math.max(0, match.index - 95);
    const end = Math.min(text.length, match.index + match[0].length + 95);
    const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
    if (!cues.test(snippet)) continue;
    if (/across (?:our )?(?:customers|clients|markets|business|operations)\b/i.test(snippet)) continue;
    const label = /costa\s+rica/i.test(match[0]) ? "Costa Rica" : /latam/i.test(match[0]) ? "LATAM" : "Latin America";
    return { label, evidence: snippet.slice(0, 240) };
  }
  return undefined;
}

function rolesFor(title) {
  const roles = [];
  if (/full[\s-]?stack/i.test(title)) roles.push("Full stack");
  if (/back[\s-]?end|backend/i.test(title)) roles.push("Backend");
  if (/front[\s-]?end|frontend/i.test(title)) roles.push("Frontend");
  if (/software engineer|software developer|application engineer|developer experience/i.test(title)) roles.push("Software Engineering");
  if (/platform|devops|site reliability|\bSRE\b|cloud engineer/i.test(title)) roles.push("Platform / DevOps");
  if (/data engineer/i.test(title)) roles.push("Data Engineering");
  if (/machine learning|\bAI engineer/i.test(title)) roles.push("AI / Machine Learning");
  if (/security engineer/i.test(title)) roles.push("Security Engineering");
  if (/QA automation|test automation|automation engineer/i.test(title)) roles.push("Test Automation");
  if (/mobile engineer/i.test(title)) roles.push("Mobile Engineering");
  return [...new Set(roles)];
}

function scoreJob(job, company, preference) {
  const title = job.title;
  const combined = `${title} ${job.description}`;
  const technologies = technologyPatterns.filter(([, pattern]) => pattern.test(combined)).map(([name]) => name);
  const regional = regionalEligibility(job);
  const roles = rolesFor(title);
  const reason = !rolePattern.test(title) ? "irrelevant-title" : avoidTitlePattern.test(title) ? "excluded-title" : !regional ? "no-explicit-current-location-eligibility" : "accepted";
  if (reason !== "accepted") return { accepted: false, reason, technologies, roles };
  const score = (preferredRolePattern.test(title) ? 6 : 2)
    + Math.min(technologies.length, 4)
    + (regional.label === "Costa Rica" ? 5 : 3)
    + (preference?.liked ? 4 : 0)
    - (preference?.disliked ? 2 : 0)
    + (company.model === "outsourcing" ? 1 : 0)
    + (job.postedOn && job.postedOn >= "2026-10-26" ? 1 : 0);
  return { accepted: true, score, regional, technologies, roles, reason };
}

function normalizedFeed(board, payload) {
  if (board.provider === "smartrecruiters") return payload.content || payload.postings || [];
  if (Array.isArray(payload)) return payload;
  return payload.jobs || [];
}

async function readPreferences(baseUrl) {
  try {
    const data = await requestJson(`${baseUrl}/api/comp/session`);
    return data.preferences || {};
  } catch { return {}; }
}

async function collectBoard(board) {
  const url = atsFeedUrl(board);
  try {
    const payload = await requestJson(url);
    const feed = normalizedFeed(board, payload).map(item => normalizeFeedJob(board.provider, item)).filter(item => item?.id);
    const refsById = new Map();
    for (const ref of board.refs) {
      const id = ref.ats.id.toLowerCase();
      if (!refsById.has(id)) refsById.set(id, []);
      refsById.get(id).push(ref);
    }
    const result = [];
    const liveIds = new Set(feed.map(item => item.id.toLowerCase()));
    for (const item of feed) {
      let refs = refsById.get(item.id.toLowerCase());
      if (!refs?.length) {
        // ATS feeds can expose additional live roles beyond the saved Comp job rows.
        refs = [...board.companyKeys].map(key => {
          const company = board.refs.find(ref => ref.company.key === key)?.company;
          return company ? { company, job: undefined, ats: { provider: board.provider, board: board.board, id: item.id } } : undefined;
        }).filter(Boolean).slice(0, 1);
      }
      for (const ref of refs || []) {
        const company = ref.company;
        const fullJob = { ...item };
        const assessment = scoreJob(fullJob, company, undefined);
        result.push({ company, item: fullJob, assessment, matchedSavedJob: !!ref.job, board: boardKey(board), feedUrl: url, savedJob: ref.job });
      }
    }
    const stale = board.refs.filter(ref => !liveIds.has(ref.ats.id.toLowerCase())).length;
    return { board: boardKey(board), provider: board.provider, companyCount: board.companyKeys.size, feedUrl: url, ok: true, feedCount: feed.length, staleSavedIds: stale, jobs: result };
  } catch (error) {
    return { board: boardKey(board), provider: board.provider, companyCount: board.companyKeys.size, feedUrl: url, ok: false, feedCount: 0, staleSavedIds: board.refs.length, error: error instanceof Error ? error.message : String(error), jobs: [] };
  }
}

function makeSelectedJob(record, preference) {
  const { company, item, assessment, board, savedJob } = record;
  const id = savedJob?.id || `${board}:${item.id}`;
  const location = item.location || "Not stated";
  const eligibility = assessment.regional.evidence;
  const checked = checkedOn;
  const levels = /\b(?:staff|principal|lead|senior|sr\.)\b/i.test(item.title) ? ["Senior"] : /\b(?:junior|associate|entry[ -]level)\b/i.test(item.title) ? ["Junior"] : [];
  const technologyText = assessment.technologies.join(", ");
  const why = [
    assessment.regional.label === "Costa Rica" ? "explicit Costa Rica location" : `explicit ${assessment.regional.label} eligibility`,
    "active on the employer's ATS feed",
    assessment.roles.length ? assessment.roles.join(" / ") : "software engineering role",
    technologyText ? `stack evidence: ${technologyText}` : "stack not stated in the source feed",
    preference?.liked ? "liked employer" : "",
  ].filter(Boolean).join("; ");
  const url = item.url || savedJob?.url;
  const job = {
    id,
    title: item.title.trim(),
    location,
    url,
    workMode: /remote/i.test(`${location} ${item.workplaceType || ""}`) ? "Remote" : undefined,
    stack: technologyText || undefined,
    matchReason: why,
    sourceNotes: `Live ${record.board.split(":")[0]} public employer ATS feed checked ${checked}.`,
    eligibility,
    listingStatus: `Open on employer ATS; checked ${checked}.`,
    postedOn: item.postedOn,
    checkedOn: checked,
    technologies: assessment.technologies,
    roles: assessment.roles,
    levels,
  };
  for (const key of Object.keys(job)) if (job[key] === undefined || job[key] === "") delete job[key];
  return { company, job, score: assessment.score, regionalLabel: assessment.regional.label, matchedSavedJob: record.matchedSavedJob, atsBoard: board };
}

function buildBatch(selected, batchId) {
  const byCompany = new Map();
  for (const record of selected) {
    const key = record.company.key;
    const existing = byCompany.get(key) || {
      name: record.company.name,
      website: record.company.website,
      model: record.company.model || "unknown",
      tracks: record.company.tracks || [],
      tags: ["new"],
      locations: [...new Set([...(record.company.locations || []), record.regionalLabel])],
      jobs: [],
      sourceEvidence: [],
    };
    existing.jobs.push(record.job);
    existing.sourceEvidence.push({ kind: "job-posting", url: record.job.url, checkedOn: record.job.checkedOn, note: "Live employer ATS listing with explicit Costa Rica/LATAM work-location evidence." });
    byCompany.set(key, existing);
  }
  return { batchId, companies: [...byCompany.values()] };
}

async function writeJson(file, data) {
  const absolute = path.resolve(root, file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function importBatch(baseUrl, batch) {
  const response = await fetch(`${baseUrl}/api/comp/enrich`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(45000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Comp import failed (HTTP ${response.status}): ${body.error || "unknown error"}`);
  return body;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const startedAt = new Date().toISOString();
  const companies = await loadCatalog(options.baseUrl, options.concurrency);
  const { boards, unsupported } = buildBoards(companies);
  const [preferences, boardResults] = await Promise.all([
    readPreferences(options.baseUrl),
    mapLimit(boards, options.concurrency, collectBoard),
  ]);
  const preferenceCount = Object.keys(preferences).length;
  const candidates = [];
  const skips = { irrelevantTitle: 0, noExplicitLocation: 0, excludedTitle: 0, duplicatePosting: 0, archivedCompany: 0, companyCap: 0, duplicateTitle: 0 };
  const allSeen = new Set();
  for (const boardResult of boardResults) {
    for (const candidate of boardResult.jobs) {
      const identity = `${candidate.company.key}:${candidate.item.id}`;
      if (allSeen.has(identity)) { skips.duplicatePosting += 1; continue; }
      allSeen.add(identity);
      const preference = preferences[candidate.company.key] || {};
      if (preference.archived) { skips.archivedCompany += 1; continue; }
      const assessment = scoreJob(candidate.item, candidate.company, preference);
      if (!assessment.accepted) {
        if (assessment.reason === "irrelevant-title") skips.irrelevantTitle += 1;
        else if (assessment.reason === "excluded-title") skips.excludedTitle += 1;
        else skips.noExplicitLocation += 1;
        continue;
      }
      candidates.push({ ...candidate, assessment });
    }
  }
  candidates.sort((a, b) => b.assessment.score - a.assessment.score || a.company.name.localeCompare(b.company.name) || a.item.title.localeCompare(b.item.title));
  const selected = [];
  const perCompany = new Map();
  const titlesByCompany = new Map();
  for (const candidate of candidates) {
    if (selected.length >= options.target) break;
    const key = candidate.company.key;
    const count = perCompany.get(key) || 0;
    if (count >= options.maxPerCompany) { skips.companyCap += 1; continue; }
    const normalizedTitle = normalized(candidate.item.title);
    const titleSet = titlesByCompany.get(key) || new Set();
    if (titleSet.has(normalizedTitle)) { skips.duplicateTitle += 1; continue; }
    const preference = preferences[key] || {};
    const record = makeSelectedJob(candidate, preference);
    if (!record.job.url || !record.job.url.startsWith("https://")) continue;
    selected.push(record);
    perCompany.set(key, count + 1);
    titleSet.add(normalizedTitle);
    titlesByCompany.set(key, titleSet);
  }

  const batchId = `comp-ats-jobs-${checkedOn}`;
  const batch = buildBatch(selected, batchId);
  const report = {
    cohortId: batchId,
    generatedOn: checkedOn,
    startedAt,
    completedAt: new Date().toISOString(),
    method: "Comp catalog snapshot -> batched public employer ATS feeds -> exact posting ID match or current board discovery -> role, explicit location, and per-employer cap checks.",
    policy: { target: options.target, maxPerCompany: options.maxPerCompany, providers: ["Greenhouse", "Lever", "Ashby", "SmartRecruiters"], explicitLocationGate: "Current ATS title/location or work-eligibility text must explicitly say Costa Rica, LATAM, or Latin America.", roleGate: rolePattern.source },
    summary: {
      companiesRead: companies.length,
      savedJobsRead: companies.reduce((count, company) => count + (company.jobs || []).length, 0),
      atsBoardsFound: boards.length,
      atsBoardsChecked: boardResults.filter(result => result.ok).length,
      atsBoardErrors: boardResults.filter(result => !result.ok).length,
      liveFeedJobs: boardResults.reduce((count, result) => count + result.feedCount, 0),
      activeRoleAndLocationMatches: candidates.length,
      selectedJobs: selected.length,
      selectedCompanies: batch.companies.length,
      refreshedSavedJobs: selected.filter(record => record.matchedSavedJob).length,
      newlyFoundOnCurrentEmployerBoards: selected.filter(record => !record.matchedSavedJob).length,
      preferencesRead: preferenceCount,
      importRequested: options.import,
      importCompleted: false,
    },
    skips,
    boardChecks: boardResults.map(({ jobs, ...result }) => result),
    unsupportedRegionalSavedJobs: unsupported,
    selectedJobs: selected.map(record => ({ company: record.company.name, key: record.company.key, title: record.job.title, location: record.job.location, eligibility: record.job.eligibility, url: record.job.url, checkedOn: record.job.checkedOn, score: record.score, atsBoard: record.atsBoard, matchedSavedJob: record.matchedSavedJob })),
  };
  await writeJson(options.out, batch);
  if (options.import && selected.length === options.target) {
    report.importResult = await importBatch(options.baseUrl, batch);
    report.summary.importCompleted = true;
  } else if (options.import && selected.length !== options.target) {
    report.importSkippedReason = `Requested ${options.target} jobs but only ${selected.length} passed every live validation gate.`;
  }
  await writeJson(options.report, report);
  console.log(`Read ${companies.length} Comp companies and checked ${boardResults.filter(result => result.ok).length}/${boards.length} ATS boards.`);
  console.log(`Validated ${candidates.length} live engineering jobs for explicit CR/LATAM eligibility; selected ${selected.length}/${options.target} across ${batch.companies.length} companies.`);
  console.log(`Batch: ${path.relative(root, path.resolve(root, options.out))}`);
  console.log(`Report: ${path.relative(root, path.resolve(root, options.report))}`);
  if (options.import && report.summary.importCompleted) console.log(`Imported ${report.importResult.imported} company records; created ${report.importResult.created}, updated ${report.importResult.updated}.`);
  if (options.import && !report.summary.importCompleted) process.exitCode = 2;
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
