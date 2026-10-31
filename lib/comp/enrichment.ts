import type {
  CompanyCard,
  CompanyDiscovery,
  CompanyFitAssessment,
  CompanyJob,
  CompanySourceEvidence,
} from "./catalog";

export type CompanyEnrichmentInput = Pick<CompanyCard, "name"> & Partial<Pick<
  CompanyCard,
  "website" | "careersUrl" | "model" | "tracks" | "locations" | "jobs" | "discovery" | "research" | "roleEvidence" | "sourceEvidence" | "fit"
>>;

export type CompanyEnrichmentBatch = { batchId?: string; companies: CompanyEnrichmentInput[] };

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, max = 240): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return value.trim();
}

function optionalText(value: unknown, label: string, max = 1000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label, max);
}

function safeUrl(value: unknown, label: string): string | undefined {
  const raw = optionalText(value, label, 2000);
  if (!raw) return undefined;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${label} must be an absolute HTTP(S) URL.`); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error(`${label} must be an absolute HTTP(S) URL without credentials.`);
  return url.href;
}

function dateText(value: unknown, label: string): string {
  const date = requiredText(value, label, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`${label} must use a real date in YYYY-MM-DD format.`);
  return date;
}

function stringList(value: unknown, label: string, maxItems = 50): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label} must be an array of at most ${maxItems} strings.`);
  return [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`, 180)))];
}

function parseJob(value: unknown, index: number): CompanyJob {
  const job = asRecord(value, `jobs[${index}]`);
  const url = safeUrl(job.url, `jobs[${index}].url`);
  if (!url) throw new Error(`jobs[${index}].url is required.`);
  const parsed: CompanyJob = {
    id: optionalText(job.id, `jobs[${index}].id`, 240) || url,
    title: requiredText(job.title, `jobs[${index}].title`, 240),
    location: optionalText(job.location, `jobs[${index}].location`, 240) || "Not stated",
    url,
  };
  for (const field of ["workMode", "stack", "matchReason", "sourceNotes", "eligibility", "listingStatus"] as const) {
    const item = optionalText(job[field], `jobs[${index}].${field}`);
    if (item) parsed[field] = item;
  }
  for (const field of ["postedOn", "checkedOn"] as const) {
    if (job[field] !== undefined) parsed[field] = dateText(job[field], `jobs[${index}].${field}`);
  }
  for (const field of ["technologies", "roles", "levels"] as const) {
    if (job[field] !== undefined) parsed[field] = stringList(job[field], `jobs[${index}].${field}`, 30);
  }
  return parsed;
}

function parseJobs(value: unknown): CompanyJob[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) throw new Error("jobs must be an array of at most 200 postings.");
  return value.map(parseJob);
}

function parseSources(value: unknown): CompanySourceEvidence[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw new Error("sourceEvidence must contain at most 50 sources.");
  return value.map((item, index) => {
    const source = asRecord(item, `sourceEvidence[${index}]`);
    const kind = requiredText(source.kind, `sourceEvidence[${index}].kind`, 32);
    if (!["official-site", "careers-page", "job-posting", "other"].includes(kind)) throw new Error(`sourceEvidence[${index}].kind is invalid.`);
    const url = safeUrl(source.url, `sourceEvidence[${index}].url`);
    if (!url) throw new Error(`sourceEvidence[${index}].url is required.`);
    const note = optionalText(source.note, `sourceEvidence[${index}].note`, 1000);
    return {
      kind: kind as CompanySourceEvidence["kind"], url,
      checkedOn: dateText(source.checkedOn, `sourceEvidence[${index}].checkedOn`),
      ...(note ? { note } : {}),
    };
  });
}

function parseDiscovery(value: unknown): CompanyDiscovery | undefined {
  if (value === undefined) return undefined;
  const discovery = asRecord(value, "discovery");
  const source = safeUrl(discovery.source, "discovery.source");
  const officialSource = safeUrl(discovery.officialSource, "discovery.officialSource");
  if (!source || !officialSource) throw new Error("discovery.source and discovery.officialSource are required URLs.");
  const parsed: CompanyDiscovery = {
    source, sourceName: requiredText(discovery.sourceName, "discovery.sourceName", 180),
    checkedOn: dateText(discovery.checkedOn, "discovery.checkedOn"),
    region: requiredText(discovery.region, "discovery.region", 240),
    remotePolicy: requiredText(discovery.remotePolicy, "discovery.remotePolicy", 500),
    careersStatus: requiredText(discovery.careersStatus, "discovery.careersStatus", 500),
    officialSource,
    technologies: stringList(discovery.technologies, "discovery.technologies"),
    roles: stringList(discovery.roles, "discovery.roles"),
    levels: stringList(discovery.levels, "discovery.levels"),
  };
  const profileUpdated = optionalText(discovery.profileUpdated, "discovery.profileUpdated", 40);
  const modelSource = optionalText(discovery.modelSource, "discovery.modelSource", 500);
  if (profileUpdated) parsed.profileUpdated = profileUpdated;
  if (modelSource) parsed.modelSource = modelSource;
  return parsed;
}

function parseResearch(value: unknown): NonNullable<CompanyCard["research"]> | undefined {
  if (value === undefined) return undefined;
  const research = asRecord(value, "research");
  const source = safeUrl(research.source, "research.source");
  if (!source) throw new Error("research.source is required.");
  return {
    region: requiredText(research.region, "research.region", 240),
    workMode: requiredText(research.workMode, "research.workMode", 240),
    notes: requiredText(research.notes, "research.notes", 2000),
    role: requiredText(research.role, "research.role", 500),
    source,
    checkedOn: dateText(research.checkedOn, "research.checkedOn"),
  };
}

function parseFit(value: unknown): CompanyFitAssessment | undefined {
  if (value === undefined) return undefined;
  const fit = asRecord(value, "fit");
  const status = requiredText(fit.status, "fit.status", 32);
  if (!["strong", "possible", "not-fit", "unverified"].includes(status)) throw new Error("fit.status must be strong, possible, not-fit, or unverified.");
  return {
    status: status as CompanyFitAssessment["status"],
    reasons: stringList(fit.reasons, "fit.reasons", 20),
    profileVersion: requiredText(fit.profileVersion, "fit.profileVersion", 80),
    evaluatedOn: dateText(fit.evaluatedOn, "fit.evaluatedOn"),
  };
}

function parseCompany(value: unknown, index: number): CompanyEnrichmentInput {
  const item = asRecord(value, `companies[${index}]`);
  const model = optionalText(item.model, `companies[${index}].model`, 40);
  if (model && !["direct", "outsourcing", "unknown"].includes(model)) throw new Error(`companies[${index}].model must be direct, outsourcing, or unknown.`);
  const urls = {
    website: safeUrl(item.website, `companies[${index}].website`),
    careersUrl: safeUrl(item.careersUrl, `companies[${index}].careersUrl`),
  };
  const roleEvidenceValue = item.roleEvidence === undefined ? undefined : asRecord(item.roleEvidence, `companies[${index}].roleEvidence`);
  const roleEvidenceSource = roleEvidenceValue ? safeUrl(roleEvidenceValue.source, `companies[${index}].roleEvidence.source`) : undefined;
  const roleEvidence = roleEvidenceValue && roleEvidenceSource ? {
    source: roleEvidenceSource,
    checkedOn: dateText(roleEvidenceValue.checkedOn, `companies[${index}].roleEvidence.checkedOn`),
  } : undefined;
  if (roleEvidenceValue && !roleEvidence) throw new Error(`companies[${index}].roleEvidence.source is required.`);
  return {
    name: requiredText(item.name, `companies[${index}].name`, 180),
    ...urls,
    model: (model || "unknown") as CompanyCard["model"],
    tracks: stringList(item.tracks, `companies[${index}].tracks`),
    locations: stringList(item.locations, `companies[${index}].locations`),
    jobs: parseJobs(item.jobs),
    discovery: parseDiscovery(item.discovery),
    research: parseResearch(item.research),
    roleEvidence,
    sourceEvidence: parseSources(item.sourceEvidence),
    fit: parseFit(item.fit),
  };
}

export function parseCompanyEnrichmentBatch(value: unknown): CompanyEnrichmentBatch {
  const body = asRecord(value, "Request body");
  if (!Array.isArray(body.companies) || body.companies.length < 1 || body.companies.length > 100) {
    throw new Error("companies must contain between 1 and 100 company records.");
  }
  const batchId = optionalText(body.batchId, "batchId", 120);
  return { batchId, companies: body.companies.map(parseCompany) };
}
