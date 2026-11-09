import { NextRequest, NextResponse } from "next/server";
import { getCompanies, getCompanyPage } from "@/lib/comp/store";
import {
  companyCategoryKeys,
  COMPANY_CATEGORIES,
  matchesCompanyCategory,
} from "@/lib/comp/categories";
import {
  availableCompanyCountries,
  companyJobCategory,
  companySignals,
  matchesSearchQuery,
  matchesCompanyFilters,
  type CompanyCard,
  type CompanyFilters,
} from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const knownCategories = new Set(
  COMPANY_CATEGORIES.map((category) => category.key),
);
const companyGroupKeys = ["companies"] as const;

function readPreferenceKeys(params: URLSearchParams, name: string) {
  return params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .filter((key) => key.length > 0 && key.length <= 160)
    .slice(0, 1000);
}

function isSavedJob(value: unknown): value is CompanyCard["jobs"][number] {
  if (!value || typeof value !== "object") return false;
  const job = value as CompanyCard["jobs"][number];
  if (
    typeof job.id !== "string" ||
    typeof job.title !== "string" ||
    typeof job.url !== "string" ||
    typeof job.location !== "string"
  ) return false;
  try {
    const url = new URL(job.url);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function matchesSavedJobFilters(
  company: CompanyCard,
  job: CompanyCard["jobs"][number],
  filters: CompanyFilters,
) {
  const searchableJobText = [
    company.name,
    company.website || "",
    ...company.tracks,
    ...company.locations,
    job.title,
    job.location,
    job.workMode || "",
    job.stack || "",
  ].join(" ").toLowerCase();
  return matchesSearchQuery(filters.query, searchableJobText);
}

async function searchCatalog(params: URLSearchParams) {
  const requestedGroup = params.get("group");
  if (!companyGroupKeys.some((key) => key === requestedGroup)) {
    return NextResponse.json(
      { error: "Choose a valid company group." },
      { status: 400 },
    );
  }
  const page = Math.max(
    1,
    Math.min(100_000, Math.floor(Number(params.get("page")) || 1)),
  );
  const pageSize = [12, 24, 48].includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : 24;
  const category = params.get("tab") || "all";
  const isJobCategory = ["saved-jobs", "applied-jobs", "archived-jobs"].includes(category);
  if (!knownCategories.has(category) && !["archived", "saved-jobs", "applied-jobs", "archived-jobs"].includes(category))
    return NextResponse.json(
      { error: "Unknown company category." },
      { status: 400 },
    );

  const fastPageOnly = params.get("fastPageOnly") === "true";
  const isUnfilteredAllView =
    category === "all" &&
    !(params.get("query") || "").trim() &&
    params.get("latamCostaRicaFilter") !== "true" &&
    params.get("hideWithoutDomain") !== "true" &&
    (params.get("country") || "all") === "all" &&
    (params.get("technology") || "all") === "all" &&
    (params.get("role") || "all") === "all" &&
    (params.get("level") || "all") === "all" &&
    (params.get("region") || "all") === "all" &&
    params.get("researchOnly") !== "true";
  if (fastPageOnly && isUnfilteredAllView) {
    try {
      const result = await getCompanyPage(page, pageSize);
      const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
      return NextResponse.json(
        {
          ...result,
          page,
          pageCount,
          pageSize,
          countryOptions: [],
          categoryCounts: {},
          stats: {
            total: result.total,
            linked: 0,
            nearshore: 0,
            researched: 0,
            midLevel: 0,
          },
          fastPageOnly: true,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch {
      // Fall back to the local catalog when MongoDB is unavailable.
    }
  }

  let catalog: CompanyCard[];
  try {
    const savedCompanies = await getCompanies();
    catalog = savedCompanies.map((company) => ({
      ...company,
      categories: companyCategoryKeys(company),
    }));
  } catch {
    // Load the large local catalog only when MongoDB is unavailable.
    const { companies: sourceCompanies } = await import("@/lib/comp/companies");
    catalog = sourceCompanies.map((company) => ({
      ...company,
      categories: companyCategoryKeys(company),
    }));
  }
  const jobCounts = catalog.reduce<Record<string, number>>(
    (counts, company) => {
      for (const job of company.jobs) {
        const key = companyJobCategory(job);
        counts[key] = (counts[key] || 0) + 1;
      }
      return counts;
    },
    {},
  );
  const latestNewBatchId = catalog
    .filter((company) => company.tags?.includes("new") && company.extraction?.batchId)
    .reduce((latest, company) => {
      const updatedAt = Date.parse(company.extraction?.updatedAt || "") || 0;
      if (!latest || updatedAt > latest.updatedAt) {
        return { id: company.extraction?.batchId || "", updatedAt };
      }
      return latest;
    }, undefined as { id: string; updatedAt: number } | undefined)?.id;
  const totalStats = {
    total: catalog.length,
    linked: catalog.filter((company) => company.website).length,
    nearshore: catalog.filter((company) => company.nearshore).length,
    researched: catalog.filter((company) => company.research).length,
    midLevel: catalog.filter((company) =>
      companySignals(company).levels.includes("Mid-level"),
    ).length,
  };
  const canonicalKeys = new Map(
    catalog.flatMap((company) =>
      [company.key, ...(company.legacyKeys || [])].map(
        (key) => [key, company.key] as const,
      ),
    ),
  );
  const liked = new Set(
    readPreferenceKeys(params, "liked").map(
      (key) => canonicalKeys.get(key) || key,
    ),
  );
  const disliked = new Set(
    readPreferenceKeys(params, "disliked").map(
      (key) => canonicalKeys.get(key) || key,
    ),
  );
  const archived = new Set(
    readPreferenceKeys(params, "archived").map(
      (key) => canonicalKeys.get(key) || key,
    ),
  );
  let savedJobPreferences: {
    key: string;
    companyName: string;
    likedJobIds: string[];
    archivedJobIds: string[];
    appliedJobIds: string[];
    addedJobs: CompanyCard["jobs"];
  }[] = [];
  try {
    const parsed = JSON.parse(params.get("savedJobs") || "[]");
    if (Array.isArray(parsed)) {
      savedJobPreferences = parsed.flatMap((item) => {
        if (!item || typeof item.key !== "string") return [];
        const likedJobIds = Array.isArray(item.likedJobIds)
          ? item.likedJobIds.filter((id: unknown): id is string => typeof id === "string" && id.length <= 250).slice(0, 500)
          : [];
        const archivedJobIds = Array.isArray(item.archivedJobIds)
          ? item.archivedJobIds.filter((id: unknown): id is string => typeof id === "string" && id.length <= 250).slice(0, 500)
          : [];
        const appliedJobIds = Array.isArray(item.appliedJobIds)
          ? item.appliedJobIds.filter((id: unknown): id is string => typeof id === "string" && id.length <= 250).slice(0, 500)
          : [];
        const addedJobs = Array.isArray(item.addedJobs)
          ? item.addedJobs.filter(isSavedJob)
          : [];
        if (!likedJobIds.length && !addedJobs.length) return [];
        return [{
          key: canonicalKeys.get(item.key) || item.key,
          companyName: typeof item.companyName === "string" ? item.companyName.slice(0, 200) : "",
          likedJobIds,
          archivedJobIds,
          appliedJobIds,
          addedJobs,
        }];
      });
    }
  } catch {
    savedJobPreferences = [];
  }
  const preferences: Record<string, CompanyPreference> = {};
  for (const key of liked)
    preferences[key] = { ...(preferences[key] || {}), liked: true };
  for (const key of disliked)
    preferences[key] = { ...(preferences[key] || {}), disliked: true };
  for (const key of archived)
    preferences[key] = { ...(preferences[key] || {}), archived: true };
  for (const saved of savedJobPreferences)
    preferences[saved.key] = {
      ...(preferences[saved.key] || {}),
      likedJobIds: saved.likedJobIds,
      archivedJobIds: saved.archivedJobIds,
      appliedJobIds: saved.appliedJobIds,
      addedJobs: saved.addedJobs,
    };
  const filters: CompanyFilters = {
    query: (params.get("query") || "").slice(0, 160),
    latamCostaRicaFilter: params.get("latamCostaRicaFilter") === "true",
    hideWithoutDomain: params.get("hideWithoutDomain") === "true",
    country: params.get("country") || "all",
    technology: params.get("technology") || "all",
    role: params.get("role") || "all",
    level: params.get("level") || "all",
    region: params.get("region") || "all",
  };
  const researchOnly = params.get("researchOnly") === "true";
  const countCategory = (view: string) =>
    catalog.filter(
      (company) =>
        (!researchOnly || view === "nearshore" || !!company.research) &&
        matchesCompanyCategory(
          company,
          view,
          preferences[company.key],
          latestNewBatchId,
        ) &&
        matchesCompanyFilters(company, filters),
    ).length;
  const savedJobRows = new Map<string, CompanyCard>();
  const savedJobStatuses = new Map<string, { applied: boolean; archived: boolean }>();
  for (const saved of savedJobPreferences) {
    const likedIds = new Set(saved.likedJobIds);
    const archivedIds = new Set(saved.archivedJobIds);
    const appliedIds = new Set(saved.appliedJobIds);
    const manuallyAddedIds = new Set(
      saved.addedJobs.flatMap((job) => [job.id, job.url]),
    );
    const company = catalog.find(
      (candidate) => candidate.key === saved.key || candidate.legacyKeys?.includes(saved.key),
    ) || catalog.find((candidate) =>
      candidate.jobs.some((job) => likedIds.has(job.id) || likedIds.has(job.url)),
    ) || {
      key: saved.key,
      name: saved.companyName || saved.key,
      names: [saved.companyName || saved.key],
      tracks: [],
      locations: [],
      records: 0,
      model: "unknown",
      jobs: [],
    } satisfies CompanyCard;
    const preference = preferences[company.key] || preferences[saved.key];
    if (!matchesCompanyCategory(company, "saved-jobs", preference, latestNewBatchId)) continue;
    for (const job of [...company.jobs, ...saved.addedJobs]) {
      if (!likedIds.has(job.id) && !likedIds.has(job.url) &&
          !manuallyAddedIds.has(job.id) && !manuallyAddedIds.has(job.url)) continue;
      if (!matchesSavedJobFilters(company, job, filters)) continue;
      const jobKey = `${company.key}:${job.id || job.url}`;
      const jobId = job.id || job.url;
      savedJobRows.set(jobKey, { ...company, jobs: [job] });
      savedJobStatuses.set(jobKey, {
        applied: appliedIds.has(jobId) || appliedIds.has(job.url),
        archived: archivedIds.has(jobId) || archivedIds.has(job.url),
      });
    }
  }
  const allSavedJobs = [...savedJobRows.entries()];
  const savedJobs = allSavedJobs
    .filter(([key]) => !savedJobStatuses.get(key)?.archived)
    .map(([, company]) => company);
  const appliedJobs = allSavedJobs
    .filter(([key]) => {
      const status = savedJobStatuses.get(key);
      return status?.applied && !status.archived;
    })
    .map(([, company]) => company);
  const archivedJobs = allSavedJobs
    .filter(([key]) => savedJobStatuses.get(key)?.archived)
    .map(([, company]) => company);
  const categoryCounts = Object.fromEntries(
    COMPANY_CATEGORIES.filter((item) => item.group !== "Job category").map(
      (item) => [item.key, countCategory(item.key)],
    ),
  );
  categoryCounts.archived = countCategory("archived");
  categoryCounts["saved-jobs"] = savedJobs.length;
  categoryCounts["applied-jobs"] = appliedJobs.length;
  categoryCounts["archived-jobs"] = archivedJobs.length;
  const matched = isJobCategory
    ? category === "saved-jobs" ? savedJobs : category === "applied-jobs" ? appliedJobs : archivedJobs
    : catalog.filter(
        (company) =>
          (!researchOnly || category === "nearshore" || !!company.research) &&
          matchesCompanyCategory(company, category, preferences[company.key], latestNewBatchId) &&
          matchesCompanyFilters(company, filters),
      );
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageCompanies = matched.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  return NextResponse.json(
    {
      companies: pageCompanies,
      total: matched.length,
      page: currentPage,
      pageCount,
      pageSize,
      countryOptions: availableCompanyCountries(catalog),
      categoryCounts,
      jobCounts,
      stats: totalStats,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(request: NextRequest) {
  return searchCatalog(request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length")) > 300_000)
      return NextResponse.json(
        { error: "Search request is too large." },
        { status: 413 },
      );
    const body = await request.json();
    const params = new URLSearchParams();
    for (const key of [
      "group",
      "tab",
      "page",
      "pageSize",
      "query",
      "latamCostaRicaFilter",
      "hideWithoutDomain",
      "country",
      "technology",
      "role",
      "level",
      "region",
      "researchOnly",
      "fastPageOnly",
    ]) {
      if (
        typeof body[key] === "string" ||
        typeof body[key] === "number" ||
        typeof body[key] === "boolean"
      )
        params.set(key, String(body[key]));
    }
    if (Array.isArray(body.liked))
      for (const key of body.liked.slice(0, 1000))
        if (typeof key === "string" && key.length <= 160)
          params.append("liked", key);
    if (Array.isArray(body.disliked))
      for (const key of body.disliked.slice(0, 1000))
        if (typeof key === "string" && key.length <= 160)
          params.append("disliked", key);
    if (Array.isArray(body.archived))
      for (const key of body.archived.slice(0, 1000))
        if (typeof key === "string" && key.length <= 160)
          params.append("archived", key);
    if (Array.isArray(body.savedJobs))
      params.set("savedJobs", JSON.stringify(body.savedJobs.slice(0, 1000)));
    return await searchCatalog(params);
  } catch {
    return NextResponse.json(
      { error: "Invalid company search request." },
      { status: 400 },
    );
  }
}
