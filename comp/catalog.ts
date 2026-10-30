export type CompanyJob = {
  id: string; title: string; location: string; url: string;
  workMode?: string; stack?: string; matchReason?: string; sourceNotes?: string;
  eligibility?: string; listingStatus?: string; postedOn?: string; checkedOn?: string;
  technologies?: string[]; roles?: string[]; levels?: string[];
};

export type NearshoreCompany = {
  key: string; name: string; website: string; source: string; checkedOn: string;
  notes: string; region: string; careersUrl?: string | null;
};

export type CompanyDiscovery = {
  source: string; sourceName: string; checkedOn: string; profileUpdated?: string;
  region: string; remotePolicy: string; careersStatus: string; officialSource: string;
  technologies: string[]; roles: string[]; levels: string[];
  modelSource?: string;
};

export type CompanyCard = {
  key: string; name: string; names: string[]; website?: string; careersUrl?: string;
  tracks: string[]; locations: string[]; records: number; model: string;
  categories?: string[];
  jobs: CompanyJob[]; legacyKeys?: string[];
  nearshore?: NearshoreCompany; discovery?: CompanyDiscovery;
  roleEvidence?: { source: string; checkedOn: string };
  research?: { region: string; workMode: string; notes: string; role: string; source: string; checkedOn: string };
};

export const TARGET_COMPANIES = 1000;
export const TECHNOLOGIES = ["Java", "React", "Python", "Node.js", "JavaScript", "TypeScript"] as const;
export const ROLE_TYPES = ["Full stack", "Backend", "Frontend"] as const;
export const LEVELS = ["Mid-level", "Junior", "Senior"] as const;

/** Mutually exclusive role buckets for every saved job record in the directory. */
export const JOB_CATEGORIES = [
  { key: "job-fullstack", label: "Full stack", patterns: [/\bfull[\s-]?stack\b/i] },
  { key: "job-backend", label: "Backend & APIs", patterns: [/\bback[\s-]?end\b/i, /\bapi(?:s)?\b/i, /\bplatform engineer\b/i] },
  { key: "job-frontend", label: "Frontend & web", patterns: [/\bfront[\s-]?end\b/i, /\bweb (?:engineer|developer)\b/i, /\bui engineer\b/i] },
  { key: "job-data", label: "Data & AI", patterns: [/\bdata\b/i, /\bmachine learning\b|\bml engineer\b|\bai engineer\b|\bartificial intelligence\b/i, /\banalytics\b/i] },
  { key: "job-cloud", label: "Cloud & DevOps", patterns: [/\bdevops\b|\bsre\b|\bsite reliability\b|\binfrastructure\b|\bcloud engineer\b|\bplatform operations\b/i] },
  { key: "job-qa", label: "QA & testing", patterns: [/\bqa\b|\bquality assurance\b|\btest(?:ing)? engineer\b|\bautomation test/i] },
  { key: "job-mobile", label: "Mobile apps", patterns: [/\bmobile\b|\bios engineer\b|\bandroid engineer\b|\breact native\b|\bflutter\b/i] },
  { key: "job-security", label: "Security", patterns: [/\bsecurity\b|\bapplication security\b|\bcyber/i] },
  { key: "job-product", label: "Product & design", patterns: [/\bproduct manager\b|\bproduct designer\b|\bux\b|\bui\/ux\b|\bdesign(?:er)?\b/i] },
  { key: "job-other", label: "Other / unspecified", patterns: [] },
] as const;

export type JobCategoryKey = typeof JOB_CATEGORIES[number]["key"];

/** Assign each job exactly one primary category; uncategorized evidence stays visible. */
export function companyJobCategory(job: CompanyJob): JobCategoryKey {
  const text = [job.title, job.stack || "", job.technologies?.join(" ") || "", job.roles?.join(" ") || ""].join(" ");
  return JOB_CATEGORIES.find(category => category.patterns.some(pattern => pattern.test(text)))?.key || "job-other";
}

export function normalizeCompanyName(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const multiPartSuffixes = new Set([
  "co.uk", "org.uk", "com.au", "net.au", "co.nz", "com.br", "co.in", "com.mx", "com.ar", "co.cr", "co.za",
  "co.id", "co.jp", "co.kr", "com.sg", "com.my", "com.hk", "com.tw", "com.cn", "com.tr", "co.il",
  "com.co", "com.pe", "com.ec", "com.uy", "com.gt", "com.sv", "com.ni", "com.pa", "com.do", "com.ve",
  "com.py", "com.bo", "com.ng", "co.ke", "com.pk", "com.bd", "com.ph",
]);
const sharedHosts = new Set(["github.io", "webflow.io", "notion.site"]);
const listingHosts = /(^|\.)(linkedin\.com|angel\.co|wellfound\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com)$/;
// Confirmed former names and product brands sharing a company; retain the first saved key.
const domainAliases: Record<string, string> = {
  "clevertech.biz": "lumenalta.com", "basecamp.com": "37signals.com",
  "iosapptemplates.com": "instamobile.io", "heykona.com": "15five.com",
  "plai.team": "peoplelogic.ai", "blameless.com": "firehydrant.com",
  "hmn.md": "humanmade.com", "helpscout.net": "helpscout.com",
  "runpanther.io": "panther.com", "heapanalytics.com": "heap.io",
  "helabs.com": "impulso.team", "formidable.com": "nearform.com",
};

export function companyDomain(website?: string): string | undefined {
  if (!website) return undefined;
  try {
    const url = new URL(website);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (listingHosts.test(host)) return undefined;
    if (host === "github.com" && !/^\/(?:about(?:\/.*)?)?$/.test(url.pathname)) return undefined;
    const parts = host.split(".");
    const suffix = parts.slice(-2).join(".");
    const domain = sharedHosts.has(suffix) ? host : parts.slice(multiPartSuffixes.has(suffix) ? -3 : -2).join(".");
    return domainAliases[domain] || domain;
  } catch { return undefined; }
}

const excludedNames = new Set([normalizeCompanyName("Recruiter Outreach — Company Not Provided")]);
const nameAliases: Record<string, string> = {
  accenturemexico: "accenture", athenaworks: "athenaworks", bairesdev: "bairesdev",
  fullstacklabs: "fullstack", applaudostudios: "applaudo",
};

function nameKey(name: string): string {
  const key = normalizeCompanyName(name);
  return nameAliases[key] || key;
}

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }

/** ATS IDs identify postings even when sources vary the URL spelling. */
export function mergeCompanyJobs(...sources: CompanyJob[][]): CompanyJob[] {
  const jobs = new Map<string, CompanyJob>();
  const idsByUrl = new Map<string, string>();
  for (const job of sources.flat()) {
    const key = jobs.has(job.id) ? job.id : idsByUrl.get(job.url) || job.id || job.url;
    jobs.set(key, { ...jobs.get(key), ...job });
    if (job.url) idsByUrl.set(job.url, key);
  }
  return [...jobs.values()];
}

/** Existing keys win merges so browser preferences keep working after imports. */
export function buildCompanyCatalog(base: CompanyCard[], nearshore: NearshoreCompany[], expansion: CompanyCard[] = []): CompanyCard[] {
  const result: CompanyCard[] = [];
  const domains = new Map<string, CompanyCard>();
  const names = new Map<string, CompanyCard>();
  const add = (incoming: CompanyCard) => {
    if (!incoming.name.trim() || excludedNames.has(normalizeCompanyName(incoming.name))) return;
    const domain = companyDomain(incoming.website);
    const existing = (domain ? domains.get(domain) : undefined) || names.get(nameKey(incoming.name));
    let company: CompanyCard;
    if (existing) {
      company = existing;
      company.names = unique([...company.names, ...incoming.names, incoming.name]);
      company.legacyKeys = unique([...(company.legacyKeys || []), incoming.key, ...(incoming.legacyKeys || [])]).filter(key => key !== company.key);
      company.website ||= incoming.website;
      company.careersUrl ||= incoming.careersUrl;
      company.tracks = unique([...company.tracks, ...incoming.tracks]);
      company.locations = unique([...company.locations, ...incoming.locations]);
      company.jobs = mergeCompanyJobs(company.jobs, incoming.jobs);
      company.records = company.jobs.length;
      company.nearshore ||= incoming.nearshore;
      company.discovery ||= incoming.discovery;
      company.research ||= incoming.research;
    } else {
      company = { ...incoming, names: [...incoming.names], tracks: [...incoming.tracks], locations: [...incoming.locations], jobs: mergeCompanyJobs(incoming.jobs) };
      result.push(company);
    }
    if (domain) domains.set(domain, company);
    for (const name of [...company.names, company.name]) names.set(nameKey(name), company);
  };
  base.forEach(add);
  for (const entry of nearshore) add({
    key: entry.key, name: entry.name, names: [entry.name], website: entry.website,
    careersUrl: entry.careersUrl || undefined, tracks: ["Nearshore"], locations: [entry.region],
    records: 0, model: "outsourcing", jobs: [], nearshore: entry,
  });
  expansion.forEach(add);
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

const techPatterns: Record<string, RegExp> = {
  Java: /\bjava\b|\bspring(?: boot)?\b/i,
  React: /\breact(?:js|\.js)?\b|\bnext\.?js\b/i,
  Python: /\bpython\b|\bdjango\b|\bfastapi\b|\bflask\b/i,
  "Node.js": /\bnode(?:\.?js| js)?\b|\bnest\.?js\b|\bexpress\.?js\b/i,
  JavaScript: /\bjavascript\b/i, TypeScript: /\btypescript\b/i,
};
const rolePatterns: Record<string, RegExp> = {
  "Full stack": /\bfull[\s-]?stack\b/i, Backend: /\bback[\s-]?end\b/i, Frontend: /\bfront[\s-]?end\b/i,
};
const levelPatterns: Record<string, RegExp> = {
  "Mid-level": /\bmid[\s-]?(?:level|senior)\b|\bintermediate\b|\bsemi[\s-]?senior\b|\b(?:software|backend|frontend|full.stack) (?:engineer|developer) (?:ii|2)\b/i,
  Junior: /\bjunior\b|\bentry[\s-]level\b/i,
  Senior: /\bsenior\b|\bstaff (?:software|engineer)\b|\bprincipal (?:software|engineer)\b/i,
};

export type CompanySignals = { technologies: string[]; roles: string[]; levels: string[] };
const companySignalsCache = new WeakMap<CompanyCard, CompanySignals>();

export function companySignals(company: CompanyCard): CompanySignals {
  const cached = companySignalsCache.get(company);
  if (cached) return cached;
  const techText = [...company.tracks, ...company.jobs.flatMap(job => [job.title, job.stack || ""])].join(" ");
  const roleText = [...company.tracks, ...company.jobs.map(job => job.title), company.research?.role || ""].join(" ");
  const signals = {
    technologies: unique([...(company.discovery?.technologies || []), ...company.jobs.flatMap(job => job.technologies || []), ...TECHNOLOGIES.filter(tech => techPatterns[tech].test(techText))]),
    roles: unique([...(company.discovery?.roles || []), ...company.jobs.flatMap(job => job.roles || []), ...ROLE_TYPES.filter(role => rolePatterns[role].test(roleText))]),
    levels: unique([...(company.discovery?.levels || []), ...company.jobs.flatMap(job => job.levels || []), ...LEVELS.filter(level => levelPatterns[level].test(company.jobs.map(job => job.title).join(" | ")))]),
  };
  companySignalsCache.set(company, signals);
  return signals;
}

export type CompanyFilters = { query: string; technology: string; role: string; level: string; region: string };
const companySearchTextCache = new WeakMap<CompanyCard, string>();

function companySearchText(company: CompanyCard, signals: CompanySignals) {
  const cached = companySearchTextCache.get(company);
  if (cached) return cached;
  const text = [company.name, ...company.names, company.website || "", ...company.tracks, ...company.locations,
    ...signals.technologies, ...signals.roles, ...signals.levels, ...company.jobs.flatMap(job => [job.title, job.stack || ""]),
    company.discovery?.region || "", company.nearshore ? "nearshore" : ""].join(" ").toLowerCase();
  companySearchTextCache.set(company, text);
  return text;
}

export function matchesCompanyFilters(company: CompanyCard, filters: CompanyFilters): boolean {
  const signals = companySignals(company);
  const text = companySearchText(company, signals);
  const region = company.discovery?.region || company.locations.join(" ");
  const queryWords = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return queryWords.every(word => text.includes(word))
    && (filters.technology === "all" || signals.technologies.includes(filters.technology))
    && (filters.role === "all" || signals.roles.includes(filters.role))
    && (filters.level === "all" || signals.levels.includes(filters.level))
    && (filters.region === "all" || (filters.region === "global" ? /worldwide|global/i.test(region)
      : /latin america|latam|americas|costa rica|brazil|mexico|colombia|argentina|uruguay|chile|peru|ecuador|el salvador|guatemala|panama/i.test(region)));
}
