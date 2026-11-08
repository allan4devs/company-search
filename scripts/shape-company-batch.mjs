#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.log("Usage: node scripts/shape-company-batch.mjs <deduped-candidates.json> <review-manifest.json> --out <shaped-leads.json>");
  console.log("Selects fit/location-screened survivors, retains dated first-party evidence, and applies documented overrides.");
}

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--out") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--out requires a value.");
      options.out = value;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    positional.push(arg);
  }
  if (positional.length > 2) throw new Error("Provide a candidate file and a review manifest.");
  [options.candidates, options.manifest] = positional;
  return options;
}

function unwrap(input) {
  if (Array.isArray(input)) return input;
  return input?.candidates || input?.leads || input?.companies || [];
}

function rootDomain(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    const multipart = new Set(["co.uk", "org.uk", "com.au", "net.au", "co.nz", "com.br", "co.in", "com.mx", "com.ar", "co.cr", "com.co", "com.pe", "com.ec", "com.uy", "com.gt", "com.sv", "com.ni", "com.pa", "com.do", "com.ve", "com.py", "com.bo"]);
    return parts.slice(multipart.has(parts.slice(-2).join(".")) ? -3 : -2).join(".");
  } catch { return ""; }
}

function nameKey(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function officialEvidence(candidate, override, checkedOn) {
  const urls = new Set(override.evidenceUrls || []);
  for (const item of [...(candidate.officialFitSnippets || []), ...(candidate.officialLocationSnippets || []), ...(candidate.officialRegionalPresenceSnippets || [])]) {
    if (item?.url) urls.add(item.url);
  }
  if (candidate.website) urls.add(candidate.website);
  if (override.careersUrl || candidate.careersUrl) urls.add(override.careersUrl || candidate.careersUrl);

  const primary = [...urls]
    .filter(url => /^https?:\/\//i.test(url))
    .slice(0, 8)
    .map(url => ({
      kind: /career|trabaj|empleo|vacan|jobs\b|opportunit/i.test(url) ? "careers-page" : "official-site",
      url,
      checkedOn,
    }));
  const supporting = (override.supportingEvidence || [])
    .filter(item => item && ["official-site", "careers-page", "job-posting", "other"].includes(item.kind) && /^https?:\/\//i.test(item.url || ""))
    .map(item => ({ kind: item.kind, url: item.url, checkedOn }));
  const byUrl = new Map([...primary, ...supporting].map(item => [item.url, item]));
  return [...byUrl.values()].slice(0, 10);
}

function shape(candidate, override, checkedOn) {
  const officialLocationText = (candidate.officialLocationSnippets || [])
    .map(item => String(item?.snippet || ""))
    .join(" ");
  const mentionsCostaRica = /Costa\s+Rica/i.test(officialLocationText);
  const mentionsLatam = /\bLATAM\b|Latin America/i.test(officialLocationText);
  const officeCountries = (candidate.regionalPresenceCountries || []).filter(country => !/costa rica/i.test(country)).slice(0, 4);
  const locations = override.locations || [
    ...(mentionsCostaRica ? ["Costa Rica (official company-level signal; confirm work eligibility on each posting)"] : []),
    ...(candidate.regionalWorkEligibilityVerified ? ["LATAM (remote eligibility stated; confirm Costa Rica on each posting)"] : []),
    ...(officeCountries.length ? ["LATAM (official company presence: " + officeCountries.join(", ") + "; confirm eligibility per opening)"] : []),
    ...(!mentionsCostaRica && !candidate.regionalWorkEligibilityVerified && mentionsLatam
      ? ["LATAM (official page names the region; confirm role eligibility on each posting)"]
      : []),
  ];
  const fitReason = override.fitReason || (
    candidate.regionalWorkEligibilityVerified
      ? "Official pages support relevant software/technology work and LATAM eligibility; confirm Costa Rica on each job posting."
      : officeCountries.length
        ? ["Official pages support software work and company presence in ", officeCountries.slice(0, 2).join(", "), "; verify eligible work country per opening."].join("")
      : mentionsCostaRica
        ? "Official pages support relevant software/technology work and Costa Rica presence; confirm job location and current openings on the careers page."
        : "Official pages support relevant software/technology work and name LATAM; confirm the hiring country on each opening."
  );
  const record = {
    name: override.name || candidate.name,
    queryLane: candidate.queryLane || candidate.searchLane || candidate.lane || "unspecified",
    website: override.website || candidate.website,
    careersUrl: override.careersUrl ?? candidate.careersUrl ?? "",
    model: override.model || "unknown",
    tracks: override.tracks || ["Software Engineering"],
    locations,
    jobs: override.jobs ?? [],
    sourceEvidence: officialEvidence(candidate, override, checkedOn),
    fit: {
      status: override.fitStatus || "possible",
      reasons: [fitReason],
      profileVersion: "v1",
      evaluatedOn: checkedOn,
    },
  };
  if (!record.careersUrl) delete record.careersUrl;
  return record;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.candidates || !options.manifest || !options.out) {
    usage();
    if (!options.help) process.exitCode = 2;
    return;
  }

  const candidatesPath = path.resolve(root, options.candidates);
  const manifestPath = path.resolve(root, options.manifest);
  const outPath = path.resolve(root, options.out);
  const [candidateInput, manifest] = await Promise.all([
    fs.readFile(candidatesPath, "utf8").then(JSON.parse),
    fs.readFile(manifestPath, "utf8").then(JSON.parse),
  ]);
  const candidates = unwrap(candidateInput);
  if (!candidates.length) throw new Error("Candidate file has no candidates.");

  const byName = new Map(candidates.map(candidate => [nameKey(candidate.name), candidate]));
  const excludeNames = new Set((manifest.excludeNames || []).map(nameKey));
  const includeNames = new Set((manifest.includeNames || []).map(nameKey));
  const overrides = new Map(Object.entries(manifest.overrides || {}).map(([name, value]) => [nameKey(name), value]));
  const checkedOn = manifest.checkedOn || getCostaRicaDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) throw new Error("Manifest checkedOn must use YYYY-MM-DD.");

  const selected = candidates.filter(candidate =>
    !excludeNames.has(nameKey(candidate.name))
    && candidate.officialIdentityVerified !== false
    && (candidate.localPresenceVerified || candidate.regionalWorkEligibilityVerified || candidate.regionalPresenceVerified)
    && (candidate.officialFitSnippets || []).length > 0,
  );
  for (const name of includeNames) {
    const candidate = byName.get(name);
    if (!candidate) throw new Error(`Included candidate was not in the deduped input: ${name}`);
    if (!selected.some(item => nameKey(item.name) === name)) selected.push(candidate);
  }

  const shaped = selected.map(candidate => shape(candidate, overrides.get(nameKey(candidate.name)) || {}, checkedOn));
  const names = new Map();
  const domains = new Map();
  for (const company of shaped) {
    const name = nameKey(company.name);
    const domain = rootDomain(company.website);
    if (!name || !domain) throw new Error(`Missing name or official website for ${company.name || "unknown company"}.`);
    if (names.has(name)) throw new Error(`Duplicate normalized name in cohort: ${company.name} / ${names.get(name)}.`);
    if (domains.has(domain)) throw new Error(`Duplicate official root domain in cohort: ${company.name} / ${domains.get(domain)} (${domain}).`);
    if (!company.locations.some(value => /costa\s+rica|\blatam\b|latin america/i.test(value))) throw new Error(`No approved Costa Rica/LATAM location on ${company.name}.`);
    if (!company.sourceEvidence.length) throw new Error(`No dated first-party evidence on ${company.name}.`);
    if (company.fit.reasons[0].length > 180) throw new Error(`Fit reason is too long on ${company.name}.`);
    names.set(name, company.name);
    domains.set(domain, company.name);
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ cohortId: manifest.cohortId || path.basename(outPath, ".json"), generatedOn: checkedOn, candidates: shaped }, null, 2)}\n`, "utf8");
  console.log(`Shaped ${shaped.length} candidates from ${candidates.length} deduped leads.`);
  console.log(`Checked unique names/domains and dated first-party evidence; wrote ${path.relative(root, outPath)}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
