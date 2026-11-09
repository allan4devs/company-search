#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedAts = /(?:^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com|teamtailor\.com|breezy\.hr|workable\.com|smartrecruiters\.com|bamboohr\.com|rippling\.com|icims\.com|myworkdayjobs\.com|oraclecloud\.com)$/i;
const careerLinkPattern = /career|job|vacanc|opening|work-with-us|talent|empleo|trabaja|oportunidades|vacantes|bolsa-de-trabajo/i;
const regionPattern = /\b(?:Costa\s+Rica|LATAM|Latin America)\b/i;
const countryMap = [
  ["Mexico", /\b(?:Mexico|M[eé]xico)\b/i], ["Guatemala", /\bGuatemala\b/i], ["Belize", /\bBelize\b/i],
  ["Honduras", /\bHonduras\b/i], ["El Salvador", /\bEl Salvador\b/i], ["Nicaragua", /\bNicaragua\b/i],
  ["Panama", /\b(?:Panama|Panam[aá])\b/i], ["Cuba", /\bCuba\b/i],
  ["Dominican Republic", /\b(?:Dominican Republic|Rep[uú]blica Dominicana)\b/i], ["Haiti", /\b(?:Haiti|Ha[iï]ti)\b/i],
  ["Puerto Rico", /\bPuerto Rico\b/i], ["Colombia", /\bColombia\b/i], ["Venezuela", /\bVenezuela\b/i],
  ["Ecuador", /\bEcuador\b/i], ["Peru", /\b(?:Peru|Per[uú])\b/i], ["Bolivia", /\bBolivia\b/i],
  ["Chile", /\bChile\b/i], ["Argentina", /\bArgentina\b/i], ["Uruguay", /\bUruguay\b/i],
  ["Paraguay", /\bParaguay\b/i], ["Brazil", /\b(?:Brazil|Brasil)\b/i], ["Guyana", /\bGuyana\b/i], ["Suriname", /\bSuriname\b/i],
];

function parseArgs(args) {
  const options = { concurrency: 28, input: "company-batches/lookalikes-v2-20261108.json" };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (["--concurrency", "--input", "--out", "--import-out"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = arg === "--concurrency" ? Number(value) : value;
    } else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 40) throw new Error("--concurrency must be between 1 and 40.");
  return options;
}

function htmlText(html) {
  return decode(String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:\/?)(?:p|div|li|article|section|h[1-6]|tr|td|th|label|button|option|summary|dt|dd|header|footer|main|aside|ul|ol|br)\b[^>]*>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[\t\f\r ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
}

function decode(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function sameOrChild(host, parent) { return !!host && (host === parent || host.endsWith(`.${parent}`)); }

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? "")]));
}

function discoverCareerLinks(html, pageUrl, siteHost) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const open = match[0].slice(0, match[0].indexOf(">") + 1);
    const attr = attrs(open);
    const label = htmlText(match[0]).replace(/\s+/g, " ");
    if (!attr.href || !careerLinkPattern.test(`${attr.href} ${label}`)) continue;
    try {
      const url = new URL(attr.href, pageUrl);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) continue;
      const host = hostOf(url.href);
      if (sameOrChild(host, siteHost) || allowedAts.test(host)) links.push({ url: url.href, label });
    } catch {}
  }
  return links;
}

function approvedCareersUrl(candidate, siteHost) {
  const value = String(candidate.careersUrl || "");
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = hostOf(url.href);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && (sameOrChild(host, siteHost) || allowedAts.test(host)) ? url.href : "";
  } catch { return ""; }
}

async function fetchPage(url) {
  const response = await fetch(url, {
    redirect: "follow", signal: AbortSignal.timeout(9000),
    headers: { "user-agent": "TheCompEmployerResearch/2.0 (public careers eligibility audit)", accept: "text/html,application/xhtml+xml" },
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!/html|xhtml/i.test(contentType)) throw new Error(`not-html:${contentType || "unknown"}`);
  const html = (await response.text()).slice(0, 2_000_000);
  return { requestedUrl: url, url: response.url, status: response.status, html, text: htmlText(html) };
}

function identityMatches(name, text) {
  const norm = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const haystack = norm(text);
  const full = norm(name);
  if (!full) return false;
  if (haystack.includes(full)) return true;
  const ignored = new Set(["inc", "llc", "ltd", "corp", "corporation", "company", "co", "sa", "srl", "group", "the", "and", "gmbh"]);
  const tokens = full.split(/\s+/).filter(token => token.length >= 3 && !ignored.has(token));
  return !!tokens.length && tokens.every(token => new RegExp(`(?:^| )${token}(?: |$)`).test(haystack));
}

function regionCandidates(text) {
  const found = [];
  for (const match of text.matchAll(new RegExp(regionPattern.source, "gi"))) {
    const v = match[0];
    found.push({ label: /costa/i.test(v) ? "Costa Rica" : "LATAM", index: match.index, value: v });
  }
  for (const [country, pattern] of countryMap) {
    for (const match of text.matchAll(new RegExp(pattern.source, "gi"))) found.push({ label: "LATAM", country, index: match.index, value: match[0] });
  }
  return found.sort((a, b) => a.index - b.index);
}

function hiringEvidence(page) {
  // Require explicit work-eligibility wording or a location attached to a role on the
  // employer's careers page. A generic career heading, blog article, market list, or office
  // presence is not enough.
  for (const region of regionCandidates(page.text)) {
    const before = page.text.slice(Math.max(0, region.index - 170), region.index);
    const after = page.text.slice(region.index + region.value.length, region.index + region.value.length + 100);
    const around = `${before.slice(-125)} ${region.value} ${after.slice(0, 90)}`.replace(/\s+/g, " ").trim();
    const direct = /\b(?:hiring|hire|recruit(?:ment|ing)?|eligible|eligibility|work from|working from|candidate\w*|applicant\w*)\b[^.!?]{0,80}$/i.test(before)
      || /^[^.!?]{0,80}\b(?:hiring|hire|recruit(?:ment|ing)?|eligible|eligibility|work from|working from|candidate\w*|applicant\w*)\b/i.test(after)
      || /\b(?:remote|work from|working from)\s+(?:in|from|within|across)\s+(?:LATAM|Latin America|Costa\s+Rica)\b/i.test(around)
      || /\b(?:LATAM|Latin America|Costa\s+Rica)\b[^.!?]{0,60}\b(?:remote|work from|working from)\b/i.test(around);
    const roleBefore = /\b(?:position|role|job|opening|vacanc\w*|engineer|developer|designer|manager|specialist|analyst|recruiter|consultant|support)\b/i.test(before.slice(-150));
    const nearbyRemote = /\bremote\b/i.test(after.slice(0, 60)) || /\bremote\b/i.test(before.slice(-60));
    const roleLocation = !!region.country && roleBefore && nearbyRemote;
    if (!direct && !roleLocation) continue;
    const nearby = around.slice(0, 350);
    const note = region.country
      ? `Official careers page shows a remote role/location entry for ${region.country}.`
      : `Official careers page explicitly ties hiring or work eligibility to ${region.label}.`;
    return {
      location: region.label === "Costa Rica" ? "Costa Rica (hiring evidence)" : region.country ? `LATAM (hiring location: ${region.country})` : "LATAM (hiring evidence)",
      note, snippet: nearby, matchedRegion: region.value, country: region.country || null,
    };
  }
  return null;
}

async function auditOne(company) {
  const host = hostOf(company.website);
  const base = { name: company.name, website: company.website || "", careersUrl: "", checkedPages: [], result: "no-explicit-LATAM-or-Costa-Rica-hiring-evidence", evidence: null };
  if (!host) return { ...base, result: "missing-candidate-domain" };
  let home;
  try { home = await fetchPage(company.website); }
  catch (error) { return { ...base, result: `homepage-unreachable:${error.message}` }; }
  const careerLink = discoverCareerLinks(home.html, home.url, host)[0];
  const careersUrl = careerLink?.url || approvedCareersUrl(company, host);
  const identityOk = identityMatches(company.name, home.text) || (!!careersUrl && identityMatches(company.name, home.text));
  const homeCheck = { url: home.url, status: home.status, identityMatched: identityOk };
  const pages = [home];
  const checkedPages = [homeCheck];
  let careersError = "";
  if (careersUrl && careersUrl !== home.url) {
    try {
      const careers = await fetchPage(careersUrl);
      pages.push(careers);
      checkedPages.push({ url: careers.url, status: careers.status, identityMatched: identityMatches(company.name, `${home.text} ${careers.text}`) });
    } catch (error) { careersError = error.message; checkedPages.push({ url: careersUrl, status: 0, error: error.message }); }
  }
  // The positive must be on a careers page or an official careers-linked page, and the official
  // homepage must identify the same employer. We never load or save individual job records.
  if (!identityOk) return { ...base, careersUrl, checkedPages, result: "company-identity-not-confirmed-on-official-site" };
  if (careersError) return { ...base, careersUrl, checkedPages, result: `careers-source-unreachable:${careersError}` };
  if (pages.length === 1) return { ...base, careersUrl: "", checkedPages, result: "no-careers-source-found-on-official-homepage" };
  const evidence = pages.length > 1 ? hiringEvidence(pages[1]) : null;
  if (!evidence) return { ...base, careersUrl: careersUrl || home.url, checkedPages, result: "no-explicit-LATAM-or-Costa-Rica-hiring-evidence" };
  return {
    ...base, careersUrl: pages[1].url, checkedPages, result: "explicit-hiring-evidence", evidence: {
      kind: "careers-page", url: pages[1].url, note: evidence.note, snippet: evidence.snippet, location: evidence.location,
      matchedRegion: evidence.matchedRegion, country: evidence.country,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/audit-v2-latam-hiring.mjs [--input file.json] [--concurrency 28] [--out report.json] [--import-out batch.json]");
    return;
  }
  const inputPath = path.resolve(root, options.input);
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const companies = Array.isArray(input) ? input : input.companies || [];
  if (!companies.length) throw new Error("Input has no companies.");
  const audit = Array(companies.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(options.concurrency, companies.length) }, async () => {
    while (cursor < companies.length) {
      const index = cursor++;
      try { audit[index] = await auditOne(companies[index]); }
      catch (error) { audit[index] = { name: companies[index].name, website: companies[index].website || "", result: `audit-error:${error.message}`, checkedPages: [] }; }
    }
  }));
  const today = getCostaRicaDate();
  const accepted = audit.filter(item => item.result === "explicit-hiring-evidence");
  const importBatch = {
    batchId: "lookalikes-v2-20261108-p001",
    companies: accepted.map(item => ({
      name: item.name, website: item.website, careersUrl: item.careersUrl, tags: ["new"],
      locations: [item.evidence.location], jobs: [],
      sourceEvidence: [{ kind: "careers-page", url: item.evidence.url, checkedOn: today, note: item.evidence.note }],
    })),
  };
  const reportPath = path.resolve(root, options.out || "company-batches/lookalikes-v2-latam-audit-20261108-report.json");
  const importPath = path.resolve(root, options.importOut || "company-batches/lookalikes-v2-latam-audit-20261108-import.json");
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({ cohortId: "lookalikes-v2-20261108", checkedOn: today, inputCount: companies.length, auditedCount: audit.length, positiveCount: accepted.length, jobsCollected: 0, audit, importBatch: path.relative(root, importPath) }, null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(importPath), { recursive: true });
  await fs.writeFile(importPath, `${JSON.stringify(importBatch, null, 2)}\n`, "utf8");
  const counts = audit.reduce((map, item) => map.set(item.result, (map.get(item.result) || 0) + 1), new Map());
  console.log(`Audited ${audit.length} companies; ${accepted.length} have explicit first-party LATAM/Costa Rica hiring evidence. No job records collected.`);
  for (const [status, count] of counts) console.log(`  ${count} ${status}`);
  console.log(`Wrote ${path.relative(root, reportPath)} and ${path.relative(root, importPath)}.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
