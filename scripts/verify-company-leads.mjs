#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCostaRicaDate } from "./company-search-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const regionPattern = /Costa\s+Rica|\bLATAM\b|Latin America/i;
const engineeringPattern = /software|application development|web development|mobile development|technology services|IT services|SaaS|cloud|engineering|engineer|developer|cybersecurity|data engineering|systems integration|tecnolog[ií]as? de (?:la )?informaci[oó]n|servicios? de TI|servicios? tecnol[oó]gicos? de (?:software|informaci[oó]n|desarrollo)|soluciones? (?:de software|inform[aá]ticas)|sistemas de informaci[oó]n|ciberseguridad|desarrollo de (?:software|aplicaciones|sistemas)|computaci[oó]n en la nube|anal[ií]tica de datos|inteligencia artificial aplicada/i;
const educationProviderPattern = /\b(?:university|universidad|college|higher education|educational institution|school|escuela|instituto|facultad|educaci[oó]n|cursos|courses)\b/i;
const softwareBusinessPattern = /software development|software engineering|custom software|software product|software platform|application development|web development|mobile development|desarrollo de software|desarrollo de aplicaciones|software a medida|software como servicio|SaaS/i;
const localPresencePattern = /(?:based in|headquarter|office|location|address|contact|we are in|we're in|founded in|founded in Costa Rica|located in|company in|oficina|ubicaci[oó]n|direcci[oó]n|sucursal|contacto|con sede|ubicad[oa]s? en|fundad[oa] en|empresa costarricense|Costa Rica\s*[:|]|(?:San Jos[eé]|Heredia|Alajuela|Cartago|Escaz[uú]|Curridabat|Tib[aá]s|Santa Ana|Tres R[ií]os)[\s\S]{0,90}Costa Rica|Costa Rica[\s\S]{0,90}(?:San Jos[eé]|Heredia|Alajuela|Cartago|Escaz[uú]|Curridabat|Tib[aá]s|Santa Ana|Tres R[ií]os)|Costa Rica[\s\S]{0,90}(?:\+?\s?506|\(506\)))/i;
const regionalWorkPattern = /(?:(?:remote|remoto|work from|trabajo remoto|anywhere|open to|available in|hiring in|eligible|eligibility|position|role|job|empleo|vacante)[^.!?]{0,100}(?:Costa Rica|\bLATAM\b|Latin America)|(?:Costa Rica|\bLATAM\b|Latin America)[^.!?]{0,100}(?:remote|remoto|work from|anywhere|open to|available in|hiring|eligible|position|role|job|empleo|vacante))/i;
const latinAmericanCountries = [
  ["Mexico", /M[eé]xico|Mexico/i], ["Guatemala", /Guatemala/i], ["Belize", /Belize/i],
  ["Honduras", /Honduras/i], ["El Salvador", /El Salvador/i], ["Nicaragua", /Nicaragua/i],
  ["Panama", /Panam[aá]|Panama/i], ["Cuba", /Cuba/i], ["Dominican Republic", /Dominican Republic|Rep[uú]blica Dominicana/i],
  ["Haiti", /Haiti|Ha[iï]ti/i], ["Puerto Rico", /Puerto Rico/i], ["Colombia", /Colombia/i],
  ["Venezuela", /Venezuela/i], ["Ecuador", /Ecuador/i], ["Peru", /Per[uú]/i], ["Bolivia", /Bolivia/i],
  ["Chile", /Chile/i], ["Argentina", /Argentina/i], ["Uruguay", /Uruguay/i], ["Paraguay", /Paraguay/i],
  ["Brazil", /Brazil|Brasil/i], ["Guyana", /Guyana/i], ["Suriname", /Suriname/i],
];
const regionalOfficeCue = /(?:\boffices?\b|\bheadquarters?\b|\bhead office\b|\b(?:our|company|global|regional)\s+locations?\b|\blocations\b|\boffice address\b|\bbased in\b|\bheadquartered in\b|\blocated in\b|\bteam in\b|\bteam based in\b|\bdevelopment center\b|\bdelivery center\b|\bengineering center\b|\bhub\b|\bsede\b|\boficinas?\b|\bdirecci[oó]n\b|\bdomicilio\b|\bcon sede\b|\bubicad[oa]s? en\b|\bequipo en\b|\bcentro de (?:desarrollo|ingenier[ií]a)|\bhub de desarrollo)/i;

function regionalPresenceMatches(text, pageUrl) {
  const matches = [];
  for (const [country, countryPattern] of latinAmericanCountries) {
    for (const found of text.matchAll(new RegExp(`\\b(?:${countryPattern.source})\\b`, "gi"))) {
      const before = text.slice(Math.max(0, found.index - 100), found.index).split(/[.!?]/).at(-1) || "";
      const after = text.slice(found.index + found[0].length, Math.min(text.length, found.index + found[0].length + 100)).split(/[.!?]/)[0] || "";
      if (!regionalOfficeCue.test(before) && !regionalOfficeCue.test(after)) continue;
      const start = Math.max(0, found.index - 120);
      const end = Math.min(text.length, found.index + found[0].length + 120);
      matches.push({ url: pageUrl, country, snippet: text.slice(start, end) });
      break;
    }
  }
  return matches;
}

function parseArgs(args) {
  const options = { concurrency: 24, maxPages: 2, out: "", limit: 0, offset: 0 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (["--out", "--concurrency", "--max-pages", "--limit", "--offset"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--out") options.out = value;
      else if (arg === "--concurrency") options.concurrency = Number(value);
      else options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = Number(value);
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    if (options.input) throw new Error("Only one input file is allowed.");
    options.input = arg;
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 30) throw new Error("--concurrency must be between 1 and 30.");
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1 || options.maxPages > 3) throw new Error("--max-pages must be between 1 and 3.");
  if (!Number.isInteger(options.limit) || options.limit < 0) throw new Error("--limit must be zero (all candidates) or a positive integer.");
  if (!Number.isInteger(options.offset) || options.offset < 0) throw new Error("--offset must be a non-negative integer.");
  return options;
}

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function textFromHtml(html) {
  return decode(String(html || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? "")]));
}

function linksFrom(html, pageUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const open = match[0].slice(0, match[0].indexOf(">") + 1);
    const attrs = attributes(open);
    if (!attrs.href) continue;
    try {
      const url = new URL(attrs.href, pageUrl);
      if (!/^https?:$/.test(url.protocol)) continue;
      links.push({ url: url.href, label: textFromHtml(match[0]) });
    } catch {}
  }
  return links;
}

function rootHost(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function normalizeIdentity(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function companyIdentityMatches(candidate, page) {
  const pageText = normalizeIdentity(page.text || "");
  const aliases = [candidate.name, ...(candidate.aliases || [])].filter(Boolean);
  const generic = new Set(["inc", "llc", "ltd", "corp", "corporation", "company", "co", "sa", "srl", "group", "the", "and"]);
  for (const alias of aliases) {
    const normalized = normalizeIdentity(alias);
    if (!normalized) continue;
    if (pageText.includes(normalized)) return true;
    const tokens = normalized.split(/\s+/).filter(token => token.length >= 3 && !generic.has(token));
    if (!tokens.length) continue;
    if (tokens.length === 1) {
      if (new RegExp(`(?:^| )${tokens[0]}(?: |$)`).test(pageText)) return true;
    } else if (tokens.every(token => new RegExp(`(?:^| )${token}(?: |$)`).test(pageText))) return true;
  }
  return false;
}

function relevantLink(links, pattern, websiteHost) {
  return links.find(link => {
    const host = rootHost(link.url);
    return host && (host === websiteHost || host.endsWith(`.${websiteHost}`) || /greenhouse\.io$|lever\.co$|ashbyhq\.com$|workable\.com$|smartrecruiters\.com$|bamboohr\.com$|rippling\.com$|icims\.com$|myworkdayjobs\.com$|oraclecloud\.com$/i.test(host)) && pattern.test(`${link.url} ${link.label}`);
  })?.url || "";
}

function approvedCareerUrl(value, websiteHost) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const firstParty = host === websiteHost || host.endsWith(`.${websiteHost}`);
    const ats = /(?:^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com|teamtailor\.com|breezy\.hr|workable\.com|smartrecruiters\.com|bamboohr\.com|rippling\.com|icims\.com|myworkdayjobs\.com|oraclecloud\.com)$/i.test(host);
    return firstParty || ats ? url.href : "";
  } catch { return ""; }
}

function snippetsFor(text, pattern, maxMatches = 4) {
  const snippets = [];
  for (const match of text.matchAll(new RegExp(pattern.source, "gi"))) {
    snippets.push(text.slice(Math.max(0, match.index - 110), Math.min(text.length, match.index + match[0].length + 150)));
    if (snippets.length >= maxMatches) break;
  }
  return snippets;
}

function laneSummary(candidates) {
  const lanes = new Map();
  for (const candidate of candidates) {
    const lane = String(candidate.queryLane || candidate.lane || "unspecified");
    const stats = lanes.get(lane) || { checked: 0, reachable: 0, regionAndFit: 0, localOrEligibleAndFit: 0 };
    stats.checked += 1;
    if (typeof candidate.officialSiteStatus === "number") stats.reachable += 1;
    if (candidate.regionVerifiedOnOfficialSource && candidate.likelyFit) stats.regionAndFit += 1;
    if (candidate.likelyFit && (candidate.localPresenceVerified || candidate.regionalWorkEligibilityVerified || candidate.regionalPresenceVerified)) stats.localOrEligibleAndFit += 1;
    lanes.set(lane, stats);
  }
  return [...lanes.entries()].map(([lane, stats]) => ({
    lane,
    ...stats,
    regionAndFitRate: stats.checked ? Number((stats.regionAndFit / stats.checked).toFixed(3)) : 0,
    localOrEligibleAndFitRate: stats.checked ? Number((stats.localOrEligibleAndFit / stats.checked).toFixed(3)) : 0,
    recommendation: stats.checked >= 20 && stats.localOrEligibleAndFit / stats.checked < 0.15
      ? "pause: fewer than 15% passed fit plus location; try a new source or segment"
      : "continue, then compare against the next batch",
  })).sort((a, b) => b.localOrEligibleAndFitRate - a.localOrEligibleAndFitRate || b.localOrEligibleAndFit - a.localOrEligibleAndFit);
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    headers: { "user-agent": "CompanyDirectoryResearchBot/1.0 (+public employer site verification)", accept: "text/html,application/xhtml+xml" },
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!/text\/html|xhtml/i.test(contentType)) throw new Error(`not-html:${contentType || "unknown content type"}`);
  const html = (await response.text()).slice(0, 3_000_000);
  return { requestedUrl: url, url: response.url, status: response.status, html, text: textFromHtml(html), links: linksFrom(html, response.url) };
}

async function verify(candidate, options) {
  const proposedWebsite = candidate.website || (typeof candidate.websiteCandidate === "string" ? candidate.websiteCandidate : candidate.websiteCandidate?.url);
  if (!proposedWebsite) return { ...candidate, officialSiteStatus: "no official website resolved", officialIdentityVerified: false, officialPagesChecked: 0, officialLocationSnippets: [], officialFitSnippets: [] };
  const host = rootHost(proposedWebsite);
  let home;
  try { home = await fetchHtml(proposedWebsite); }
  catch (error) { return { ...candidate, website: "", officialSiteStatus: error.message, officialIdentityVerified: false, officialPagesChecked: 1, officialLocationSnippets: [], officialFitSnippets: [] }; }
  if (!companyIdentityMatches(candidate, home)) {
    return { ...candidate, website: "", officialSiteStatus: "site content does not confirm this company identity", officialPagesChecked: 1, officialLocationSnippets: [], officialFitSnippets: [] };
  }

  const careerUrl = approvedCareerUrl(candidate.careersUrl, host)
    || relevantLink(home.links, /career|job|vacanc|opening|work-with-us|talent|empleo|trabaja|trabaje|oportunidades|vacantes|bolsa-de-trabajo/i, host);
  const aboutUrl = relevantLink(home.links, /about|team|company|nosotros|quienes-somos|quiénes-somos/i, host);
  const contactUrl = relevantLink(home.links, /contact|office|location|contacto|sucursales|ubicaciones|oficinas|direcci[oó]n|ubicaci[oó]n/i, host);
  const homeLocationEvidence = snippetsFor(home.text || "", regionPattern, 16);
  const homeFitEvidence = snippetsFor(home.text || "", engineeringPattern);
  const homeRegionalPresence = regionalPresenceMatches(home.text || "", home.url);
  const homeHasLocalPresence = homeLocationEvidence.some(snippet => localPresencePattern.test(snippet));
  const homeHasRegionalEligibility = homeLocationEvidence.some(snippet => regionalWorkPattern.test(snippet));
  const homeHasCompleteEvidence = homeFitEvidence.length > 0 && (homeHasLocalPresence || homeHasRegionalEligibility || homeRegionalPresence.length > 0);
  const preferredTargets = [];
  if (!homeHasCompleteEvidence) {
    const locationMissing = !homeHasLocalPresence && !homeHasRegionalEligibility && !homeRegionalPresence.length;
    preferredTargets.push(...(locationMissing ? [aboutUrl, careerUrl, contactUrl] : [careerUrl, aboutUrl, contactUrl]));
  }
  const targets = [...new Set(preferredTargets.filter(url => url && url !== home.url))].slice(0, options.maxPages);
  const pages = [home];
  // Skip follow-up requests when the homepage already proves fit and a local or
  // regional work signal. Otherwise fetch only the most useful first-party pages.
  // This caps each company at one identity request plus two evidence requests.
  const targetPages = await Promise.all(targets.map(async url => {
    try { return await fetchHtml(url); }
    catch (error) { return { requestedUrl: url, url, status: 0, text: "", links: [], error: error.message }; }
  }));
  pages.push(...targetPages);
  // Location references can appear after long service/marketing sections, so
  // inspect more hits than the fit screen before assigning any location flag.
  const locationEvidence = pages.flatMap(page => snippetsFor(page.text || "", regionPattern, 16).map(snippet => ({ url: page.url, snippet })));
  const regionalPresenceEvidence = pages.flatMap(page => regionalPresenceMatches(page.text || "", page.url));
  const rawFitEvidence = pages.flatMap(page => snippetsFor(page.text || "", engineeringPattern).map(snippet => ({ url: page.url, snippet })));
  const fullPageText = pages.map(page => page.text || "").join(" ");
  const educationOnlySignal = educationProviderPattern.test(`${candidate.name} ${fullPageText}`)
    && !softwareBusinessPattern.test(fullPageText);
  const fitEvidence = educationOnlySignal ? [] : rawFitEvidence;
  const localPresenceVerified = locationEvidence.some(item => localPresencePattern.test(item.snippet));
  const regionalWorkEligibilityVerified = locationEvidence.some(item => regionalWorkPattern.test(item.snippet));
  const regionalPresenceCountries = [...new Set(regionalPresenceEvidence.map(item => item.country))];
  const regionalPresenceVerified = regionalPresenceCountries.length > 0;
  const locationValues = [...new Set(locationEvidence.flatMap(item => {
    const value = item.snippet.match(regionPattern)?.[0];
    if (!value) return [];
    return [/costa\s+rica/i.test(value) ? "Costa Rica" : /\blatam\b/i.test(value) ? "LATAM" : "Latin America"];
  }).concat(regionalPresenceVerified ? ["LATAM"] : []))];
  return {
    ...candidate,
    website: home.url,
    officialIdentityVerified: true,
    officialPagesChecked: pages.length,
    careersUrl: careerUrl,
    officialSiteStatus: home.status,
    officialPages: pages.map(page => ({ url: page.url, status: page.status, error: page.error || null })),
    officialLocations: locationValues,
    officialLocationSnippets: locationEvidence,
    officialRegionalPresenceSnippets: regionalPresenceEvidence,
    regionalPresenceCountries,
    officialFitSnippets: fitEvidence,
    likelyFit: fitEvidence.length > 0,
    fitReviewReason: educationOnlySignal ? "education provider; engineering terms describe courses or instruction, not a software employer" : undefined,
    regionVerifiedOnOfficialSource: locationValues.length > 0,
    localPresenceVerified,
    regionalWorkEligibilityVerified,
    regionalPresenceVerified,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input) {
    console.log("Usage: node scripts/verify-company-leads.mjs <unique-leads.json> [--concurrency 24] [--max-pages 2] [--offset 0] [--limit 200] [--out verified-leads.json]");
    console.log("Fetches only catalog-unique official sites, skips follow-up pages when the homepage proves fit/location, and checks up to two targeted company/careers pages otherwise.");
    if (!options.help) process.exitCode = 2;
    return;
  }
  const inputPath = path.resolve(root, options.input);
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const allCandidates = Array.isArray(input) ? input : input.candidates || input.leads || input.companies || [];
  if (!allCandidates.length) throw new Error("Input contains no company candidates.");
  const candidates = allCandidates.slice(options.offset, options.limit ? options.offset + options.limit : undefined);
  if (!candidates.length) throw new Error(`No candidates exist at offset ${options.offset}.`);

  const startedAt = Date.now();
  const results = Array(candidates.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(options.concurrency, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      try { results[index] = await verify(candidates[index], options); }
      catch (error) { results[index] = { ...candidates[index], officialSiteStatus: error instanceof Error ? error.message : String(error), officialPagesChecked: 1, officialLocationSnippets: [], officialFitSnippets: [] }; }
    }
  }));

  const outPath = path.resolve(root, options.out || inputPath.replace(/\.json$/i, "-official-verified.json"));
  const queryLanes = laneSummary(results);
  const elapsedMs = Date.now() - startedAt;
  const pagesChecked = results.reduce((sum, candidate) => sum + (candidate.officialPagesChecked || 0), 0);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({
    cohortId: input.cohortId || input.batchId || path.basename(inputPath, ".json"),
    checkedOn: getCostaRicaDate(),
    sourceInput: path.relative(root, inputPath),
    inputCandidateCount: allCandidates.length,
    candidateOffset: options.offset,
    candidateCount: results.length,
    remainingCandidateCount: Math.max(0, allCandidates.length - options.offset - results.length),
    elapsedMs,
    officialPagesChecked: pagesChecked,
    verifierOptions: { concurrency: options.concurrency, maxFollowupPages: options.maxPages },
    queryLanes,
    candidates: results,
  }, null, 2)}\n`, "utf8");
  const verified = results.filter(candidate => candidate.regionVerifiedOnOfficialSource && candidate.likelyFit).length;
  const strong = results.filter(candidate => candidate.likelyFit && (candidate.localPresenceVerified || candidate.regionalWorkEligibilityVerified || candidate.regionalPresenceVerified)).length;
  console.log(`Checked ${results.length} of ${allCandidates.length} unique sites (offset ${options.offset}) in ${(elapsedMs / 1000).toFixed(1)}s across ${pagesChecked} official page requests; ${verified} show an official Costa Rica/LATAM signal plus engineering fit; ${strong} also pass a local-presence/work-eligibility evidence pattern.`);
  for (const lane of queryLanes) console.log(`  ${lane.lane}: ${lane.localOrEligibleAndFit}/${lane.checked} passed both fit and location; ${lane.recommendation}.`);
  console.log(`Wrote ${path.relative(root, outPath)}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
