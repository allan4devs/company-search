#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const today = getCostaRicaDate();
const locationPattern = /costa\s+rica|\blatam\b|latin america/i;
const jobPattern = /engineer|engineering|developer|development|architect|devops|sre|quality assurance|software|data engineer|ai engineer/i;
const evidenceKinds = new Set(["official-site", "careers-page", "job-posting", "other"]);
const evidenceKindAliases = new Map([
  ["official-source", "other"],
  ["career-portal", "careers-page"],
]);

function usage() {
  console.log("Usage: node scripts/prepare-company-batch.mjs <verified-leads.json> --batch-id id [--out company-batch.json] [--ledger ledger.json] [--limit 100]");
  console.log("Input must contain verified company records with official sources, fit assessments, and a Costa Rica/LATAM location signal.");
}

function parseArgs(args) {
  const options = { limit: 100 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (["--batch-id", "--out", "--ledger", "--limit"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    if (options.input) throw new Error("Only one input file is allowed.");
    options.input = arg;
  }
  options.limit = Number(options.limit);
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new Error("--limit must be between 1 and 100.");
  return options;
}

function nameKey(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const multipartSuffixes = new Set(["co.uk", "org.uk", "com.au", "net.au", "co.nz", "com.br", "co.in", "com.mx", "com.ar", "co.cr", "co.za", "com.co", "com.pe", "com.ec", "com.uy", "com.gt", "com.sv", "com.ni", "com.pa", "com.do", "com.ve", "com.py", "com.bo"]);
function rootDomain(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (/(^|\.)(linkedin\.com|angel\.co|wellfound\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com)$/.test(host)) return "";
    const parts = host.split(".");
    return parts.slice(multipartSuffixes.has(parts.slice(-2).join(".")) ? -3 : -2).join(".");
  } catch { return ""; }
}

function unwrap(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.companies)) return input.companies;
  if (Array.isArray(input?.candidates)) return input.candidates;
  if (Array.isArray(input?.leads)) return input.leads;
  return [];
}

function evidenceHasCheckedDate(evidence) {
  return Array.isArray(evidence) && evidence.some(item => item && /^\d{4}-\d{2}-\d{2}$/.test(item.checkedOn || "") && /^https?:\/\//i.test(item.url || ""));
}

function normalizeSourceEvidence(evidence) {
  if (!Array.isArray(evidence)) return evidence;
  return evidence.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const kind = String(item.kind || "");
    return evidenceKindAliases.has(kind) ? { ...item, kind: evidenceKindAliases.get(kind) } : item;
  });
}

function evaluate(company) {
  const reasons = [];
  if (!company?.name?.trim()) reasons.push("missing company name");
  if (!rootDomain(company?.website)) reasons.push("website must be an official HTTP(S) root, not an ATS listing");
  const jobEvidence = (company?.jobs || []).some(job => job && jobPattern.test(job.title || "") && /^https?:\/\//i.test(job.url || "") && /^\d{4}-\d{2}-\d{2}$/.test(job.checkedOn || ""));
  const locationText = [
    ...(company?.locations || []),
    ...(company?.jobs || []).flatMap(job => [job.title, job.location, job.eligibility]),
  ].filter(Boolean).join(" ");
  if (!locationPattern.test(locationText)) reasons.push("no Costa Rica, LATAM, or Latin America term in company locations or saved-job fields");
  const engineeringTrack = (company?.tracks || []).some(track => /engineering|software|developer|backend|frontend|full.?stack|data|ai|devops|sre|qa|security/i.test(track));
  if (!engineeringTrack && !jobEvidence) reasons.push("no software or adjacent engineering track/job");
  if (!evidenceHasCheckedDate(company?.sourceEvidence)) reasons.push("missing dated source evidence URL");
  const unsupportedEvidenceKinds = (company?.sourceEvidence || [])
    .map(item => String(item?.kind || ""))
    .filter(kind => !evidenceKinds.has(kind));
  if (unsupportedEvidenceKinds.length) reasons.push(`unsupported source evidence kind(s): ${[...new Set(unsupportedEvidenceKinds)].join(", ")}`);
  if (!company?.fit || !["strong", "possible"].includes(company.fit.status) || company.fit.profileVersion !== "v1") reasons.push("fit must be strong/possible with profileVersion v1");
  const longFitReasons = (company?.fit?.reasons || []).filter(reason => typeof reason !== "string" || !reason.trim() || reason.trim().length > 180);
  if (longFitReasons.length) reasons.push("each fit reason must be a non-empty string no longer than 180 characters");
  if (!["direct", "outsourcing", "unknown"].includes(company?.model)) reasons.push("model must be direct, outsourcing, or unknown");
  return { reasons, domain: rootDomain(company?.website) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input || !options.batchId) { usage(); if (!options.help) process.exitCode = 2; return; }
  const inputPath = path.resolve(options.input);
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const candidates = unwrap(input);
  if (!candidates.length) throw new Error("Input must contain a non-empty companies, candidates, or leads array.");

  const seenNames = new Map();
  const seenDomains = new Map();
  const accepted = [];
  const entries = [];
  for (const candidate of candidates) {
    const company = candidate?.company && typeof candidate.company === "object" ? { ...candidate.company, ...candidate } : candidate;
    company.sourceEvidence = normalizeSourceEvidence(company.sourceEvidence);
    const validation = evaluate(company);
    const normalizedName = nameKey(company?.name);
    const domainMatch = validation.domain && seenDomains.get(validation.domain);
    const nameMatch = normalizedName && seenNames.get(normalizedName);
    let status = "verified";
    let reason = "passed company-level fit and evidence checks";
    if (validation.reasons.length) { status = "not-fit"; reason = validation.reasons.join("; "); }
    else if (domainMatch || nameMatch) { status = "duplicate"; reason = `duplicate within this cohort${domainMatch ? ` by ${validation.domain}` : ` by name ${nameMatch}`}`; }
    if (status === "verified" && accepted.length >= options.limit) { status = "lead"; reason = `verified but beyond the ${options.limit}-company output limit`; }
    if (status === "verified") {
      const record = { ...company };
      for (const field of ["queryLane", "searchLane", "lane", "sourceUrl", "notes", "canonicalDomain"]) {
        delete record[field];
      }
      record.tags = [...new Set(["new", ...(Array.isArray(record.tags) ? record.tags : [])])];
      accepted.push(record);
      seenNames.set(normalizedName, record.name);
      seenDomains.set(validation.domain, record.name);
    }
    entries.push({ company: company?.name || null, domain: validation.domain || null, queryLane: candidate?.queryLane || candidate?.lane || "unspecified", status, reason });
  }

  if (accepted.length !== options.limit) {
    throw new Error(`Only ${accepted.length} verified unique companies passed; ${options.limit} are required. Add more unique verified leads and rerun.`);
  }

  const outputPath = path.resolve(options.out || path.join(path.dirname(inputPath), `${options.batchId}.json`));
  const ledgerPath = path.resolve(options.ledger || outputPath.replace(/\.json$/i, "-ledger.json"));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({ batchId: options.batchId, companies: accepted }, null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify({ batchId: options.batchId, checkedOn: today, entries }, null, 2)}\n`, "utf8");
  console.log(`Prepared ${accepted.length} unique verified companies in ${path.relative(root, outputPath)}.`);
  console.log(`Every company has tags:["new"]; ledger: ${path.relative(root, ledgerPath)}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
