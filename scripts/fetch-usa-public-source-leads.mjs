#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOut = path.join(root, "company-batches", "usa-latam-2026-public-leads.json");
const today = getCostaRicaDate();
const usaSpendingEndpoint = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const gdeltEndpoint = "https://api.gdeltproject.org/api/v2/doc/doc";

function usage() {
  console.log("Usage: node scripts/fetch-usa-public-source-leads.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--out leads.json] [--limit 100] [--contracts-only]");
  console.log("Collects U.S. federal software-services contract leads plus GDELT public-news and blog leads. These are not import-ready company records.");
}

function parseArgs(args) {
  const options = { from: "2026-01-01", to: today, out: defaultOut, limit: 100, contractsOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--contracts-only") { options.contractsOnly = true; continue; }
    if (["--from", "--to", "--out", "--limit"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from) || !/^\d{4}-\d{2}-\d{2}$/.test(options.to) || options.from > options.to) {
    throw new Error("--from and --to must be valid YYYY-MM-DD dates, with --from no later than --to.");
  }
  options.limit = Number(options.limit);
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new Error("--limit must be between 1 and 100.");
  return options;
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(25_000),
    headers: { "User-Agent": "TheComp-USA-public-source-lead-collector/1.0", ...(init?.headers || {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}: ${body.slice(0, 300)}`);
  try { return JSON.parse(body); }
  catch { throw new Error(`Non-JSON response from ${new URL(url).hostname}: ${body.slice(0, 300)}`); }
}

function compactAward(award) {
  return {
    awardId: award["Award ID"] || award.generated_internal_id || null,
    recipientName: award["Recipient Name"] || null,
    periodOfPerformanceStartDate: award["Start Date"] || null,
    awardAmount: award["Award Amount"] ?? null,
    awardingAgency: award["Awarding Agency"] || null,
    description: award["Award Description"] || award["Description"] || null,
    naics: award.NAICS || award["NAICS Code"] || null,
    sourceUrl: usaSpendingEndpoint,
    interpretation: "Federal software-services award lead only; this does not prove the recipient hired LATAM software developers.",
  };
}

function compactArticle(article, lane) {
  const url = article.url || "";
  const domain = article.domain || (url ? new URL(url).hostname.replace(/^www\./, "") : "");
  const pathText = url ? new URL(url).pathname.toLowerCase() : "";
  const blogLike = /^blog\./i.test(domain) || /\/(blog|engineering|tech-blog|insights)\b/i.test(pathText);
  const searchable = `${article.title || ""} ${url}`;
  const hasRegionalSignal = /\blatam\b|latin[\s-]+america|\bargentina\b|\bbrazil\b|\bcolombia\b|\bmexico\b|\bchile\b|\bperu\b|\buruguay\b|\bcosta[\s-]+rica\b/i.test(searchable);
  const hasEngineeringSignal = /software|engineer|developer|engineering|hiring|hired|recruit|career|nearshore/i.test(searchable);
  return {
    title: article.title || "Untitled article",
    url,
    domain,
    publishedOrSeenOn: article.seendate || article.date || null,
    sourceCountry: article.sourcecountry || null,
    language: article.language || null,
    sourceType: blogLike ? "company-blog-candidate" : "public-news-candidate",
    queryLane: lane,
    maybeRelevant: hasRegionalSignal && hasEngineeringSignal,
    queryEvidence: "LATAM/Latin America plus software-engineering and hiring language; verify the named employer and facts at first-party sources before import.",
  };
}

async function getContractAwards(options) {
  const body = {
    filters: {
      time_period: [{ start_date: options.from, end_date: options.to, date_type: "new_awards_only" }],
      award_type_codes: ["A", "B", "C", "D"],
      naics_codes: { require: ["541511", "541512", "541519"] },
      recipient_scope: "domestic",
    },
    fields: ["Award ID", "Recipient Name", "Start Date", "Award Amount", "Awarding Agency", "Award Description", "NAICS"],
    page: 1,
    limit: options.limit,
    sort: "Award Amount",
    order: "desc",
  };
  const data = await fetchJson(usaSpendingEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return {
    endpoint: usaSpendingEndpoint,
    filters: body.filters,
    total: data.page_metadata?.total ?? data.results?.length ?? 0,
    awards: (data.results || []).map(compactAward),
  };
}

async function getGdeltArticles(query, lane, maxRecords) {
  const url = new URL(gdeltEndpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(Math.min(maxRecords, 250)));
  url.searchParams.set("sort", "DateDesc");
  url.searchParams.set("timespan", "90d");
  const data = await fetchJson(url.toString(), { headers: { Accept: "application/json" } });
  return {
    endpoint: url.toString(),
    returned: data.articles?.length || 0,
    articles: (data.articles || []).map(article => compactArticle(article, lane)).filter(article => article.url),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { usage(); return; }

  const results = {};
  const errors = [];
  try { results.contracts = await getContractAwards(options); }
  catch (error) { errors.push({ source: "USAspending", message: error instanceof Error ? error.message : String(error) }); }

  if (options.contractsOnly) {
    results.publicArticles = { skipped: true, reason: "--contracts-only was provided; no GDELT request was made." };
  } else {
    const articleQuery = '("LATAM software engineer" OR "Latin America software engineer" OR "Latin America software developer" OR "LATAM engineering team")';
    try {
      const publicArticles = await getGdeltArticles(articleQuery, "gdelt-public-web", options.limit);
      const maybeRelevant = publicArticles.articles.filter(article => article.maybeRelevant);
      results.publicArticles = publicArticles;
      results.publicNews = maybeRelevant.filter(article => article.sourceType === "public-news-candidate");
      results.companyBlogs = maybeRelevant.filter(article => article.sourceType === "company-blog-candidate");
      results.publicArticles.filteredRelevantCount = maybeRelevant.length;
    } catch (error) { errors.push({ source: "GDELT public web articles", message: error instanceof Error ? error.message : String(error) }); }
  }

  const byRecipient = new Map();
  for (const award of results.contracts?.awards || []) {
    const name = String(award.recipientName || "").trim();
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!name || !key || byRecipient.has(key)) continue;
    byRecipient.set(key, {
      name,
      queryLane: "usaspending-contracts-2026",
      sourceUrl: award.sourceUrl,
      contractLead: { awardId: award.awardId, periodOfPerformanceStartDate: award.periodOfPerformanceStartDate, agency: award.awardingAgency, description: award.description },
      note: "New federal software-services award lead (award date signed within the requested period); this does not prove the recipient hired LATAM software developers.",
    });
  }

  const output = {
    batchId: `usa-latam-public-leads-${today}`,
    collectedOn: today,
    scope: {
      contracts: `${options.from} through ${options.to}; new domestic federal awards signed in this period for software design/development, systems design, or other computer services NAICS 541511/541512/541519. Period-of-performance start date is a separate field and may differ from signature date.`,
      newsAndBlogs: options.contractsOnly ? "Skipped by --contracts-only; no article feed request was made." : "One GDELT DOC article query over its rolling 90-day window, classified by URL path/domain and filtered by title/URL relevance signals; these are candidate classifications, not source validation.",
      usage: "Discovery leads only. A contract, article, or blog hit cannot establish LATAM engineering hiring without explicit company-level evidence.",
    },
    queryLanes: results,
    candidateLeads: [...byRecipient.values()],
    errors,
  };
  const outputPath = path.resolve(options.out);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Saved ${output.candidateLeads.length} federal contract recipients and ${results.publicArticles?.returned || 0} raw GDELT articles.`);
  console.log(`  contracts: ${results.contracts?.awards?.length || 0}; public news candidates: ${results.publicNews?.length || 0}; blog candidates: ${results.companyBlogs?.length || 0}; source errors: ${errors.length}`);
  console.log(`Wrote ${path.relative(root, outputPath)}.`);
  if (errors.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
