#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "lib", "comp", "data");
const scanVersion = 3;
const today = getCostaRicaDate();
const USER_AGENT = "TheCompCompanyResearch/2.0 (+public company-site indexing)";

function parseArgs(args) {
  const options = {
    concurrency: 24,
    timeoutMs: 10_000,
    hostGapMs: 120,
    maxPages: 5,
    maxCareerPages: 2,
    limit: Infinity,
    offset: 0,
    refresh: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--refresh") { options.refresh = true; continue; }
    if (["--input", "--out", "--concurrency", "--timeout-ms", "--host-gap-ms", "--max-pages", "--max-career-pages", "--limit", "--offset"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  for (const key of ["concurrency", "timeoutMs", "maxPages", "maxCareerPages", "limit", "offset"]) {
    if (options[key] !== Infinity) options[key] = Number(options[key]);
  }
  options.hostGapMs = Number(options.hostGapMs);
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 32) throw new Error("--concurrency must be between 1 and 32.");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 60_000) throw new Error("--timeout-ms must be between 1000 and 60000.");
  if (!Number.isInteger(options.hostGapMs) || options.hostGapMs < 0 || options.hostGapMs > 5000) throw new Error("--host-gap-ms must be between 0 and 5000.");
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1 || options.maxPages > 12) throw new Error("--max-pages must be between 1 and 12.");
  if (!Number.isInteger(options.maxCareerPages) || options.maxCareerPages < 1 || options.maxCareerPages > 6) throw new Error("--max-career-pages must be between 1 and 6.");
  if (!(options.limit === Infinity || (Number.isInteger(options.limit) && options.limit >= 1))) throw new Error("--limit must be a positive integer.");
  if (!Number.isInteger(options.offset) || options.offset < 0) throw new Error("--offset must be zero or greater.");
  return options;
}

function usage() {
  console.log("Usage: node scripts/crawl-company-sites.mjs [--input companies.json] [--out company-crawl-results.json] [--concurrency 24] [--limit N] [--offset N] [--refresh]");
  console.log("Reads the Mongo company catalog when configured; otherwise uses the bundled company files.");
  console.log("Scans the official homepage and a small number of careers, contact, and about pages for company-level info, role-based email, country evidence, and careers/work-with-us links. It does not crawl individual job postings.");
  console.log("Resumes from prior results. Use --refresh to rescan completed sites; --input can point to an exported company array.");
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function clean(value, max = 500) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, max); }
function decode(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)));
}

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? "")]));
}

const multipartSuffixes = new Set([
  "co.uk", "org.uk", "com.au", "net.au", "co.nz", "com.br", "com.mx", "com.ar", "co.cr", "co.za",
  "co.id", "co.jp", "co.kr", "com.sg", "com.my", "com.hk", "com.tw", "com.cn", "com.tr", "co.il",
  "com.co", "com.pe", "com.ec", "com.uy", "com.gt", "com.sv", "com.ni", "com.pa", "com.do", "com.ve",
  "com.py", "com.bo", "com.ng", "co.ke", "com.pk", "com.bd", "com.ph", "com.eg", "com.ua", "com.vn",
]);

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return undefined;
    return url;
  } catch { return undefined; }
}

function rootDomain(value) {
  const url = validHttpUrl(String(value || "").includes("://") ? value : `https://${value || ""}`);
  if (!url) return "";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "localhost" || /^\d+(?:\.\d+){3}$/.test(host)) return host;
  const parts = host.split(".");
  const suffix = parts.slice(-2).join(".");
  return parts.slice(multipartSuffixes.has(suffix) ? -3 : -2).join(".");
}

function normalizeWebsite(company) {
  const raw = company.website || company.domain || company.nearshore?.website;
  if (!raw) return "";
  const url = validHttpUrl(String(raw).includes("://") ? String(raw) : `https://${raw}`);
  return url ? url.href : "";
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function companyRows(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["companies", "candidates", "leads", "data"]) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

async function loadBundledCatalog() {
  const files = ["companies.json", "expanded-companies.json", "additional-companies.json", "nearshore.json"];
  const rows = [];
  for (const file of files) rows.push(...companyRows(await readJson(path.join(dataDir, file))));
  return { companies: rows, source: "bundled catalog" };
}

async function loadCatalog(inputPath) {
  if (inputPath) {
    return { companies: companyRows(await readJson(path.resolve(root, inputPath))), source: `input file: ${path.resolve(root, inputPath)}` };
  }
  if (typeof process.loadEnvFile === "function" && !process.env.MONGODB_URI) {
    try { process.loadEnvFile(path.join(root, ".env")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (!process.env.MONGODB_URI) return loadBundledCatalog();
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const collectionName = process.env.COMP_COMPANIES_COLLECTION || "comp_companies";
    const companies = await client.db(process.env.MONGODB_DB || "lva").collection(collectionName).find({}, {
      projection: { _id: 1, key: 1, name: 1, names: 1, website: 1, domain: 1, careersUrl: 1, locations: 1, model: 1, jobs: 1, nearshore: 1 },
    }).sort({ name: 1, _id: 1 }).toArray();
    return { companies, source: "MongoDB company catalog" };
  } finally { await client.close(); }
}

function mergeCompanies(rows) {
  const byDomain = new Map();
  const withoutWebsite = [];
  for (const original of rows) {
    if (!original || typeof original !== "object" || !original.name) continue;
    const website = normalizeWebsite(original);
    const domain = rootDomain(website);
    if (!domain) {
      withoutWebsite.push({ key: String(original.key || original._id || ""), name: clean(original.name, 200) });
      continue;
    }
    const found = byDomain.get(domain);
    const row = {
      key: String(original.key || original._id || domain),
      name: clean(original.name, 200),
      names: unique([original.name, ...(original.names || [])].map(value => clean(value, 200))),
      website,
      domain,
      careersUrl: validHttpUrl(original.careersUrl || original.nearshore?.careersUrl)?.href || "",
      locations: Array.isArray(original.locations) ? original.locations.filter(value => typeof value === "string") : [],
      jobs: Array.isArray(original.jobs) ? original.jobs.filter(job => job && typeof job.url === "string") : [],
    };
    if (!found) byDomain.set(domain, row);
    else {
      found.names = unique([...found.names, ...row.names]);
      found.locations = unique([...found.locations, ...row.locations]);
      found.jobs = [...new Map([...found.jobs, ...row.jobs].map(job => [job.url, job])).values()];
      found.careersUrl ||= row.careersUrl;
      if (!found.website || (found.website.startsWith("http://") && row.website.startsWith("https://"))) found.website = row.website;
    }
  }
  return { companies: [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain)), withoutWebsite };
}

const countryCodes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryAliases = new Map();
for (const code of countryCodes) {
  const name = displayNames.of(code);
  if (name && name !== code) countryAliases.set(name, name);
}
for (const [alias, canonical] of Object.entries({
  "USA": "United States", "U.S.A.": "United States", "U.S.": "United States",
  "UK": "United Kingdom", "Great Britain": "United Kingdom", "Britain": "United Kingdom",
  "Korea, South": "South Korea", "Republic of Korea": "South Korea", "Korea, Republic of": "South Korea",
  "Korea, North": "North Korea", "Czech Republic": "Czechia", "Russian Federation": "Russia",
  "Türkiye": "Turkey", "Turkiye": "Turkey", "UAE": "United Arab Emirates", "The Netherlands": "Netherlands",
  "Holland": "Netherlands", "Ivory Coast": "Côte d’Ivoire", "Cote d'Ivoire": "Côte d’Ivoire",
  "Bolivia, Plurinational State of": "Bolivia", "Venezuela, Bolivarian Republic of": "Venezuela",
  "Tanzania, United Republic of": "Tanzania", "Moldova, Republic of": "Moldova",
  "Iran, Islamic Republic of": "Iran", "Syrian Arab Republic": "Syria", "Viet Nam": "Vietnam",
  "Lao People's Democratic Republic": "Laos", "Brunei Darussalam": "Brunei", "Micronesia, Federated States of": "Micronesia",
  "Palestine, State of": "Palestine", "Taiwan, Province of China": "Taiwan", "Hong Kong SAR China": "Hong Kong",
})) countryAliases.set(alias, canonical);
const countryLabels = [...countryAliases.keys()].sort((a, b) => b.length - a.length);
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const countryScanPattern = new RegExp(`(^|[^\\p{L}])(${countryLabels.map(escaped).join("|")})(?=$|[^\\p{L}])`, "giu");
const countryPatterns = countryLabels.map(label => ({
  label,
  country: countryAliases.get(label),
  pattern: new RegExp(`(^|[^\\p{L}])(${escaped(label)})(?=$|[^\\p{L}])`, "iu"),
}));

function canonicalCountry(value) {
  const raw = clean(typeof value === "object" && value ? value.name || value.addressCountry || value.code : value, 100);
  if (!raw) return "";
  const codeMatch = raw.match(/^([A-Z]{2})$/i);
  if (codeMatch) {
    const label = displayNames.of(codeMatch[1].toUpperCase());
    if (label && label !== codeMatch[1].toUpperCase()) return countryAliases.get(label) || label;
  }
  for (const { label, country } of countryPatterns) if (raw.toLowerCase() === label.toLowerCase()) return country;
  return "";
}

function countryMentions(text, pageUrl, kind = "page-text") {
  const matches = [];
  const source = String(text || "");
  for (const match of source.matchAll(countryScanPattern)) {
    const label = match[2];
    const canonicalLabel = countryLabels.find(item => item.toLowerCase() === label.toLowerCase());
    const country = canonicalLabel ? countryAliases.get(canonicalLabel) : "";
    if (!country) continue;
    const index = match.index + match[1].length;
    if (country === "Jersey" && /\bNew\s+$/i.test(source.slice(Math.max(0, index - 12), index))) continue;
    const snippet = clean(source.slice(Math.max(0, index - 95), Math.min(source.length, index + label.length + 95)), 240);
    matches.push({ country, kind, sourceUrl: pageUrl, snippet });
  }
  return [...new Map(matches.map(item => [item.country, item])).values()];
}

function normalizeEmail(raw) {
  const value = decode(String(raw || "").replace(/^mailto:/i, "").split(/[?#]/)[0]).trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value) ? value : "";
}

const roleMailbox = /^(?:info|hello|hi|contact|contacto|hola|sales|ventas|commercial|comercial|support|help|service|servicio|customers?|careers?|jobs?|empleo|trabajo|trabajos|rrhh|hr|humanresources|recruit(?:ing|ment)?|talent|people|hiring|office|admin|team|press|media|marketing|business|partners?|enquiries|inquiries|consultas|atencion|atenci[oó]n|recepcion|recepci[oó]n|general|apply|applications?)(?:[._+-][a-z0-9]+)*$/i;
function isRoleMailbox(email) {
  const local = email.split("@")[0].replace(/\+.*/, "").replace(/[._-]/g, "");
  return roleMailbox.test(email.split("@")[0]) || /^(?:info|hello|contacto?|sales|support|careers?|jobs?|empleo|hr|rrhh|recruit(?:ing|ment)?|talent|people|hiring|office|ventas|trabajo|team|hola)/i.test(local);
}

const CAREER_RE = /(?:careers?|jobs?|employment|vacanc(?:y|ies)|openings?|open[\s_-]+roles?|positions?|work[\s_-]*with[\s_-]*us|join[\s_-]*(?:our|the)?[\s_-]*team|(?:we(?:['’]re|\s+are)|now)[\s_-]+hiring|trabaj(?:a|e|o|ar)|empleos?|oportunidades?|carreiras?|trabalhe[\s_-]*conosco|stellenangebote|karriere|offres?[\s_-]*d['’]emploi|rejoignez[\s_-]*(?:notre|l['’])?\s*equipe)/iu;
const CONTACT_RE = /(?:contact|cont[aá]ct|contacto|contato|reach[\s_-]*us|get[\s_-]*in[\s_-]*touch|talk[\s_-]*to[\s_-]*us|write[\s_-]*to[\s_-]*us|support|customer[\s_-]*service|atenci[oó]n|consultas)/iu;
const ABOUT_RE = /(?:about(?:[\s_-]*us)?|company|who[\s_-]*we[\s_-]*are|our[\s_-]*(?:story|company|team)|nosotros|sobre[\s_-]*(?:nosotros|la[\s_-]*empresa)|empresa|acerca[\s_-]*de|quienes[\s_-]*somos)/iu;
const careerTerms = ["career", "jobs", "employment", "vacanc", "opening", "work-with-us", "work_with_us", "join-our-team", "join-our", "talent", "recruit", "trabaja", "trabaja-con-nosotros", "empleo", "empleos", "oportunidades", "carreira", "trabalhe-conosco", "karriere", "stellenangebote", "offres-d-emploi"];
const ATS_HOSTS = ["greenhouse.io", "greenhouse.com", "lever.co", "ashbyhq.com", "workable.com", "smartrecruiters.com", "myworkdayjobs.com", "workday.com", "icims.com", "personio.com", "personio.de", "bamboohr.com", "breezy.hr", "recruitee.com", "teamtailor.com", "jobvite.com", "taleo.net", "successfactors.eu", "oraclecloud.com", "applytojob.com", "join.com", "rippling-ats.com", "pinpointhq.com"];

function linkKind(label, url) {
  const combined = `${label} ${url}`;
  if (CAREER_RE.test(combined)) return "careers";
  if (CONTACT_RE.test(combined)) return "contact";
  if (ABOUT_RE.test(combined)) return "about";
  return "";
}

function sameCompanyHost(url, root) { return rootDomain(url) === root; }
function isAtsHost(url) {
  const parsed = validHttpUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  return ATS_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function extractLinks(html, pageUrl, companyRoot) {
  const found = [];
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi)) {
    const tagEnd = match[0].indexOf(">");
    const attributes = attrs(match[0].slice(0, tagEnd + 1));
    if (!attributes.href || /^(?:#|javascript:|mailto:|tel:)/i.test(attributes.href)) continue;
    let url;
    try { url = new URL(attributes.href, pageUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) continue;
    url.hash = "";
    const label = clean(decode(match[0].slice(tagEnd + 1).replace(/<[^>]*>/g, " ")), 180);
    const kind = linkKind(`${label} ${attributes.title || attributes["aria-label"] || ""}`, url.href);
    if (!kind) continue;
    if (kind === "careers" ? !(sameCompanyHost(url.href, companyRoot) || isAtsHost(url.href)) : !sameCompanyHost(url.href, companyRoot)) continue;
    const normalized = url.href.replace(/\/$/, "") || url.origin;
    found.push({ url: normalized, label: label || attributes.title || attributes["aria-label"] || "", kind, sourceUrl: pageUrl, source: "homepage-link" });
  }
  const seen = new Set();
  return found.filter(item => !seen.has(`${item.kind}:${item.url}`) && seen.add(`${item.kind}:${item.url}`));
}

function metaValue(html, names) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (names.some(name => [a.name, a.property, a.itemprop].some(value => value?.toLowerCase() === name))) return clean(a.content, 1200);
  }
  return "";
}

function structuredAddressCountries(html) {
  const found = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (value.addressCountry) {
      const country = canonicalCountry(value.addressCountry);
      if (country) found.push({ country, kind: "structured-address", snippet: clean(JSON.stringify(value), 240) });
    }
    for (const [key, child] of Object.entries(value)) if (key !== "addressCountry") visit(child);
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { visit(JSON.parse(decode(match[1]).replace(/^\uFEFF/, ""))); } catch {}
  }
  return found;
}

function countryContext(snippet) {
  return /(?:headquarters?|headquartered|head office|based (?:in|out of)|located in|registered in|founded in|our office in|office in|company is in|company based in|global office in|address|postaladdress|addresscountry|domiciled in|principal place of business)/iu.test(snippet);
}

function extractEmails(html, pageUrl, companyRoot) {
  const found = new Map();
  const pageRoot = rootDomain(pageUrl);
  if (pageRoot !== companyRoot) return [];
  const candidates = [];
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (/^mailto:/i.test(a.href || "")) candidates.push(a.href);
  }
  const visible = decode(html
    .replace(/<(?:script|style|noscript|svg)\b[\s\S]*?<\/(?:script|style|noscript|svg)\s*>/gi, " ")
    .replace(/<[^>]+>/g, " "));
  candidates.push(...visible.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi).map(match => match[0]));
  for (const candidate of candidates) {
    const email = normalizeEmail(candidate);
    if (!email || !isRoleMailbox(email) || /(?:example\.com|domain\.com|sentry\.io|wixpress\.com|wordpress\.org)$/i.test(email)) continue;
    found.set(email, { email, kind: "public-role-mailbox", sourceUrl: pageUrl });
  }
  return [...found.values()];
}

function extractPage(html, pageUrl, companyRoot) {
  const title = clean(decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.replace(/<[^>]+>/g, " ")), 300);
  const description = metaValue(html, ["description", "og:description", "twitter:description"]);
  const plain = decode(html
    .replace(/<(?:script|style|noscript|svg|template)\b[\s\S]*?<\/(?:script|style|noscript|svg|template)\s*>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " "));
  const text = clean(plain, 100_000);
  const lang = html.match(/<html\b[^>]*\blang=["']([^"']+)/i)?.[1] || "";
  const links = extractLinks(html, pageUrl, companyRoot);
  const countryEvidence = structuredAddressCountries(html).map(item => ({ ...item, sourceUrl: pageUrl, confidence: "high" }));
  for (const match of html.matchAll(/<(address|footer)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const snippet = clean(decode(match[2].replace(/<[^>]+>/g, " ")), 1200);
    for (const item of countryMentions(snippet, pageUrl, match[1].toLowerCase() === "address" ? "address-markup" : "footer")) {
      countryEvidence.push({ ...item, confidence: match[1].toLowerCase() === "address" ? "high" : (countryContext(item.snippet) ? "high" : "medium") });
    }
  }
  for (const item of countryMentions(text, pageUrl)) {
    countryEvidence.push({ ...item, confidence: countryContext(item.snippet) ? "high" : "low" });
  }
  const careerCandidates = links.filter(link => link.kind === "careers");
  const contactCandidates = links.filter(link => link.kind === "contact");
  const aboutCandidates = links.filter(link => link.kind === "about");
  const images = new Set();
  for (const match of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    const src = a.src || a["data-src"] || a.srcset?.split(",")[0]?.trim().split(/\s+/)[0];
    if (src) try { images.add(new URL(src, pageUrl).href); } catch {}
  }
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (/og:image|twitter:image|^logo$/i.test(a.property || a.name || a.itemprop || "") && a.content) try { images.add(new URL(a.content, pageUrl).href); } catch {}
  }
  return {
    title,
    description,
    text,
    lang,
    links,
    careerCandidates,
    contactCandidates,
    aboutCandidates,
    hasCareerContent: CAREER_RE.test(`${title} ${description} ${text.slice(0, 20_000)}`),
    countryEvidence,
    emails: extractEmails(html, pageUrl, companyRoot),
    images: [...images].slice(0, 100),
  };
}

const hostNextFetchAt = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function paceHost(url, gapMs) {
  const host = new URL(url).host.toLowerCase();
  const now = Date.now();
  const allowedAt = hostNextFetchAt.get(host) || now;
  if (allowedAt > now) await delay(allowedAt - now);
  hostNextFetchAt.set(host, Date.now() + gapMs);
}

async function readLimited(response, limit) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, Math.min(value.byteLength, limit - size));
      chunks.push(decoder.decode(chunk, { stream: true }));
      size += chunk.byteLength;
      if (chunk.byteLength < value.byteLength) { await reader.cancel(); break; }
    }
    chunks.push(decoder.decode());
  } catch { await reader.cancel().catch(() => {}); }
  return chunks.join("");
}

async function fetchPage(url, options, companyRoot, purpose = "page") {
  const parsed = validHttpUrl(url);
  if (!parsed) return { requestedUrl: url, purpose, error: "invalid-http-url", checkedOn: today };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    await paceHost(url, options.hostGapMs);
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml;q=0.8,text/xml;q=0.7,text/plain;q=0.5", "accept-language": "en,es;q=0.9" },
    });
    const contentType = response.headers.get("content-type") || "";
    const isHtml = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType);
    const isXml = /(?:xml|text\/plain)/i.test(contentType);
    const result = { requestedUrl: url, finalUrl: response.url, purpose, status: response.status, contentType, checkedOn: today };
    if (!response.ok) { await response.body?.cancel().catch(() => {}); return { ...result, error: `http-${response.status}` }; }
    if (!isHtml && !isXml) { await response.body?.cancel().catch(() => {}); return { ...result, error: contentType ? "non-html" : "missing-content-type" }; }
    const body = await readLimited(response, isHtml ? 2_000_000 : 1_000_000);
    if (!isHtml) return { ...result, documentText: body, xml: true };
    const details = extractPage(body, response.url, companyRoot);
    const { text, links, careerCandidates, contactCandidates, aboutCandidates, countryEvidence, emails, ...savedDetails } = details;
    return { ...result, ...savedDetails, careers: careerCandidates, contacts: contactCandidates, about: aboutCandidates, countryEvidence, emails };
  } catch (error) {
    return { requestedUrl: url, purpose, checkedOn: today, error: error.name === "AbortError" ? "timeout" : clean(error.message || error, 300) };
  } finally { clearTimeout(timer); }
}

function sitemapCareerLinks(page, website, domain) {
  if (!page?.documentText) return [];
  const urls = [];
  for (const match of page.documentText.matchAll(/<loc[^>]*>\s*([\s\S]*?)\s*<\/loc>/gi)) {
    const raw = decode(match[1].replace(/<!\[CDATA\[|\]\]>/g, "")).trim();
    const parsed = validHttpUrl(raw);
    if (!parsed || !CAREER_RE.test(`${parsed.pathname} ${parsed.hostname}`)) continue;
    if (!(sameCompanyHost(parsed.href, domain) || isAtsHost(parsed.href))) continue;
    parsed.hash = "";
    urls.push({ url: parsed.href, label: "", kind: "careers", sourceUrl: page.finalUrl || website, source: "sitemap" });
  }
  return [...new Map(urls.map(item => [item.url.replace(/\/$/, ""), item])).values()];
}

function probeUrls(website, spanish) {
  const paths = spanish
    ? ["/trabaja-con-nosotros/", "/empleo/", "/careers/", "/jobs/"]
    : ["/careers/", "/jobs/", "/work-with-us/", "/trabaja-con-nosotros/"];
  return paths.slice(0, 2).map(route => new URL(route, website).href);
}

function careersPageLooksRelevant(candidate, page) {
  if (!page || page.error || page.status < 200 || page.status >= 400 || (!page.title && !page.description && !page.hasCareerContent)) return false;
  if (page.hasCareerContent) return true;
  const finalPath = validHttpUrl(page.finalUrl)?.pathname.replace(/\/+$/, "") || "";
  const candidatePath = validHttpUrl(candidate.url)?.pathname.replace(/\/+$/, "") || "";
  const redirectedToHome = finalPath === "" && (candidatePath !== "" || CAREER_RE.test(candidate.url));
  const sourceIsFirstParty = ["homepage-link", "catalog", "sitemap"].includes(candidate.source);
  return !redirectedToHome && sourceIsFirstParty && CAREER_RE.test(`${candidate.label} ${candidate.url}`);
}

function chooseCountry(pages) {
  const all = pages.flatMap(page => page.countryEvidence || []);
  const strong = all.filter(item => item.confidence === "high");
  const headquarters = strong.filter(item => /headquarters?|headquartered|head office|based (?:in|out of)|registered in|principal place of business|founded in/i.test(item.snippet || ""));
  const evidence = headquarters.length ? headquarters : strong;
  const countries = unique(evidence.map(item => item.country));
  return {
    country: countries.length === 1 ? countries[0] : countries.length > 1 ? "Multiple / unclear" : "Unknown",
    countriesMentioned: unique(all.map(item => item.country)).slice(0, 20),
    evidence: [...new Map(all.map(item => [`${item.country}:${item.kind}:${item.sourceUrl}`, item])).values()].slice(0, 40),
  };
}

function summarizePageErrors(pages) { return pages.filter(page => page.error).map(page => ({ url: page.requestedUrl, error: page.error })); }

async function crawlCompany(company, options) {
  const pages = [];
  const auxiliaryChecks = [];
  const home = await fetchPage(company.website, options, company.domain, "homepage");
  pages.push(home);
  const siteOk = !home.error && home.status >= 200 && home.status < 400;
  let careerCandidates = [...(home.careers || [])];
  if (company.careersUrl && (sameCompanyHost(company.careersUrl, company.domain) || isAtsHost(company.careersUrl))) {
    careerCandidates.unshift({ url: company.careersUrl, label: "Saved careers link", kind: "careers", sourceUrl: company.website, source: "catalog" });
  }
  careerCandidates = [...new Map(careerCandidates.map(item => [item.url.replace(/\/$/, ""), item])).values()];

  if (!careerCandidates.length && siteOk && pages.length < options.maxPages) {
    const sitemapHref = home.links?.find(item => /sitemap/i.test(item.url))?.url || new URL("/sitemap.xml", company.website).href;
    const sitemap = await fetchPage(sitemapHref, options, company.domain, "sitemap");
    auxiliaryChecks.push({ url: sitemapHref, status: sitemap.status || null, error: sitemap.error || null });
    careerCandidates = sitemapCareerLinks(sitemap, company.website, company.domain);
  }

  if (!careerCandidates.length && siteOk && pages.length < options.maxPages) {
    const spanish = /^es\b/i.test(home.lang || "") || /costa rica|latam|latin america|colombia|argentina|mexico|méxico|chile|peru|perú/i.test(company.locations.join(" "));
    for (const url of probeUrls(company.website, spanish)) {
      if (pages.length >= options.maxPages || careerCandidates.length >= options.maxCareerPages) break;
      const probe = { url, label: "Common careers path check", kind: "careers", sourceUrl: company.website, source: "common-path-probe" };
      const page = await fetchPage(url, options, company.domain, "careers-probe");
      pages.push(page);
      if (careersPageLooksRelevant(probe, page)) careerCandidates.push(probe);
    }
  }

  const uniqueCareerCandidates = [...new Map(careerCandidates.map(item => [item.url.replace(/\/$/, ""), item])).values()];
  const careersChecked = [];
  for (const candidate of uniqueCareerCandidates.slice(0, options.maxCareerPages)) {
    if (pages.length >= options.maxPages) break;
    const existing = pages.find(page => page.requestedUrl.replace(/\/$/, "") === candidate.url.replace(/\/$/, ""));
    const page = existing || await fetchPage(candidate.url, options, company.domain, "careers-page");
    if (!existing) pages.push(page);
    careersChecked.push({
      ...candidate,
      checkedOn: today,
      status: careersPageLooksRelevant(candidate, page) ? "verified-careers-page" : page.error ? "request-failed" : "not-confirmed-as-careers-page",
      httpStatus: page.status || null,
      finalUrl: page.finalUrl || null,
      pageTitle: page.title || null,
    });
  }

  const homepageLinks = home.links || [];
  const detailCandidates = [
    ...homepageLinks.filter(item => item.kind === "contact"),
    ...homepageLinks.filter(item => item.kind === "about"),
  ];
  const detailSeen = new Set();
  const maxDetails = Math.max(0, options.maxPages - pages.length);
  for (const candidate of detailCandidates) {
    if (detailSeen.has(candidate.url) || pages.length >= options.maxPages || detailSeen.size >= maxDetails) continue;
    detailSeen.add(candidate.url);
    pages.push(await fetchPage(candidate.url, options, company.domain, candidate.kind));
  }

  const careerLinks = uniqueCareerCandidates.slice(0, 10).map(candidate => {
    const checked = careersChecked.find(item => item.url.replace(/\/$/, "") === candidate.url.replace(/\/$/, ""));
    const probePage = pages.find(page => page.requestedUrl.replace(/\/$/, "") === candidate.url.replace(/\/$/, ""));
    const relevant = checked?.status === "verified-careers-page" || (!checked && careersPageLooksRelevant(candidate, probePage));
    return {
      ...candidate,
      checkedOn: today,
      status: checked?.status || (relevant ? "verified-careers-page" : "discovered-not-checked"),
      httpStatus: checked?.httpStatus || probePage?.status || null,
      finalUrl: checked?.finalUrl || probePage?.finalUrl || null,
      pageTitle: checked?.pageTitle || probePage?.title || null,
    };
  });
  const verifiedCareer = careerLinks.find(item => item.status === "verified-careers-page");
  const anyCareerRequestError = careerLinks.some(item => item.status === "request-failed");
  const careerStatus = verifiedCareer ? "found" : careerLinks.length ? (anyCareerRequestError ? "discovered_unverified" : "discovered_not_confirmed") : siteOk ? "not_found_on_scanned_pages" : "site_unreachable";
  const country = chooseCountry(pages);
  const emails = [...new Map(pages.flatMap(page => page.emails || []).map(item => [item.email, item])).values()].slice(0, 20);
  const homepage = pages[0] || {};
  const images = unique(pages.flatMap(page => page.images || [])).slice(0, 250);
  const companyJobs = [...new Map(company.jobs.map(job => [job.url, { url: job.url, title: job.title || "", location: job.location || "", source: "catalog" }])).values()];

  return {
    key: company.domain,
    name: company.name,
    names: company.names,
    website: company.website,
    domain: company.domain,
    careersUrl: verifiedCareer?.url || careerLinks[0]?.url || company.careersUrl || null,
    careersCandidates: careerLinks.map(item => item.url),
    careerStatus,
    careerLinks,
    companyInfo: {
      title: homepage.title || null,
      description: homepage.description || null,
      country: country.country,
      countriesMentioned: country.countriesMentioned,
      countryEvidence: country.evidence,
      directEmails: emails,
      checkedOn: today,
    },
    pages,
    auxiliaryChecks,
    jobs: companyJobs,
    images,
    errors: summarizePageErrors(pages),
    checkedOn: today,
    scanVersion,
  };
}

function isFresh(record) {
  if (!record || record.scanVersion !== scanVersion || !record.checkedOn) return false;
  const age = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${record.checkedOn}T12:00:00Z`)) / 86_400_000;
  return Number.isFinite(age) && age >= 0 && age < 30;
}

async function writeFinalResults(output, value) {
  const temp = `${output}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2));
  let lastError;
  for (const waitMs of [0, 250, 750, 1500]) {
    if (waitMs) await delay(waitMs);
    try {
      await fs.rename(temp, output);
      return;
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
    }
  }
  try {
    await fs.copyFile(temp, output);
    await fs.unlink(temp).catch(() => {});
  } catch (error) {
    await fs.unlink(temp).catch(() => {});
    throw new Error(`Could not replace the results file after a Windows sync lock: ${error.message || lastError?.message}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { usage(); return; }
  const output = path.resolve(root, process.env.CRAWL_OUTPUT || options.out || "company-crawl-results.json");
  const { companies: sourceRows, source } = await loadCatalog(options.input);
  const merged = mergeCompanies(sourceRows);
  const allCompanies = merged.companies;
  const selected = allCompanies.slice(options.offset, options.offset + options.limit);
  let saved = { checkedOn: today, totalCompanies: allCompanies.length, completed: {}, summary: {} };
  try { saved = { ...saved, ...JSON.parse(await fs.readFile(output, "utf8")) }; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  saved.completed ||= {};
  const progressPath = `${output}.progress.jsonl`;
  let recoveredProgress = 0;
  try {
    const progress = await fs.readFile(progressPath, "utf8");
    for (const line of progress.split("\n")) {
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        if (record?.domain && record.scanVersion === scanVersion) {
          saved.completed[record.domain] = record;
          recoveredProgress += 1;
        }
      } catch { /* Ignore a partial final journal line; the site will be retried if needed. */ }
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const pending = selected.filter(company => options.refresh || !isFresh(saved.completed[company.domain]));
  const skipped = selected.length - pending.length;
  let cursor = 0;
  let processed = 0;
  let sinceSave = 0;
  const progressBuffer = [];
  let progressQueue = Promise.resolve();
  const errors = [];
  const summary = () => {
    const records = allCompanies.map(company => saved.completed[company.domain]).filter(Boolean);
    return {
      totalCatalogCompanies: sourceRows.length,
      companiesWithWebsite: merged.companies.length,
      uniqueDomains: allCompanies.length,
      missingWebsiteCompanies: merged.withoutWebsite.length,
      selectedDomains: selected.length,
      newlyScannedDomains: processed,
      skippedFreshDomains: skipped,
      completedDomains: records.length,
      careersPagesFound: records.filter(record => record.careerStatus === "found").length,
      roleBasedEmailDomainsFound: records.filter(record => record.companyInfo?.directEmails?.length).length,
      countryIdentifiedDomains: records.filter(record => record.companyInfo?.country && !["Unknown", "Multiple / unclear"].includes(record.companyInfo.country)).length,
      pagesFetched: records.reduce((count, record) => count + (record.pages || []).filter(page => page.status).length, 0),
      checkedOn: today,
      source,
    };
  };
  saved.totalCompanies = sourceRows.length;
  saved.uniqueDomains = allCompanies.length;
  saved.missingWebsiteCompanies = merged.withoutWebsite;
  saved.source = source;
  saved.checkedOn = today;
  saved.summary = summary();
  console.log(`Catalog: ${sourceRows.length} companies, ${allCompanies.length} unique official domains, ${merged.withoutWebsite.length} without a website.`);
  console.log(`Scanning ${pending.length} domains (${skipped} fresh results reused, ${recoveredProgress} journal records restored) with ${options.concurrency} workers; max ${options.maxPages} pages per domain.`);

  async function checkpoint(force = false) {
    if (!force && sinceSave < 20) return;
    if (!progressBuffer.length) return;
    const rows = progressBuffer.splice(0);
    sinceSave -= rows.length;
    saved.summary = summary();
    const lines = `${rows.map(record => JSON.stringify(record)).join("\n")}\n`;
    progressQueue = progressQueue.then(() => fs.appendFile(progressPath, lines, "utf8"));
    await progressQueue;
    console.log(`${processed}/${pending.length} scanned; ${saved.summary.careersPagesFound} careers pages found; ${saved.summary.roleBasedEmailDomainsFound} domains with role-based email; ${saved.summary.countryIdentifiedDomains} countries identified.`);
  }

  async function worker() {
    while (cursor < pending.length) {
      const company = pending[cursor++];
      try { saved.completed[company.domain] = await crawlCompany(company, options); }
      catch (error) {
        const failed = {
          key: company.domain, name: company.name, names: company.names, website: company.website, domain: company.domain,
          careersUrl: company.careersUrl || null, careerStatus: "site_unreachable", careerLinks: [],
          companyInfo: { title: null, description: null, country: "Unknown", countriesMentioned: [], countryEvidence: [], directEmails: [], checkedOn: today },
          pages: [], auxiliaryChecks: [], jobs: [], images: [], errors: [{ error: clean(error.message || error, 300) }], checkedOn: today, scanVersion,
        };
        saved.completed[company.domain] = failed;
        errors.push({ domain: company.domain, error: clean(error.message || error, 300) });
      }
      processed += 1;
      sinceSave += 1;
      progressBuffer.push(saved.completed[company.domain]);
      await checkpoint(false);
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, worker));
  await checkpoint(true);
  saved.summary = summary();
  saved.summary.newlyScannedDomains = processed;
  saved.lastRun = { startedOn: today, completedOn: today, offset: options.offset, limit: Number.isFinite(options.limit) ? options.limit : null, concurrency: options.concurrency, maxPages: options.maxPages, refresh: options.refresh, errors: errors.length };
  saved.errors = errors;
  await writeFinalResults(output, saved);
  await fs.unlink(progressPath).catch(() => {});
  console.log(`Finished: ${processed} domains scanned, ${skipped} reused, ${saved.summary.careersPagesFound} careers pages, ${saved.summary.roleBasedEmailDomainsFound} role-email domains, ${saved.summary.countryIdentifiedDomains} countries identified.`);
  console.log(`Results: ${output}`);
}

main().catch(error => {
  console.error(`Company-site crawl failed: ${clean(error.message || error, 500)}`);
  process.exitCode = 1;
});
