import { NextRequest, NextResponse } from "next/server";
import { companies as sourceCompanies } from "@/lib/comp/companies";
import { getCompanies } from "@/lib/comp/store";
import { companyCategoryKeys, COMPANY_CATEGORIES } from "@/lib/comp/categories";
import {
  companyJobCategory,
  companySignals,
  matchesCompanyFilters,
  type CompanyCard,
  type CompanyFilters,
} from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fallbackCatalog = sourceCompanies.map((company) => ({
  ...company,
  categories: companyCategoryKeys(company),
}));
const knownCategories = new Set(
  COMPANY_CATEGORIES.map((category) => category.key),
);
const companyGroupKeys = ["companies"] as const;
type CompanyGroupKey = (typeof companyGroupKeys)[number];

function matchesCategory(
  company: CompanyCard,
  category: string,
  preference?: CompanyPreference,
) {
  if (category === "archived") return !!preference?.archived;
  if (category === "saved-jobs") return !!preference?.likedJobIds?.length;
  if (preference?.archived) return false;
  if (category === "all") return !preference?.liked && !preference?.disliked;
  if (category === "dislikes") return !!preference?.disliked;
  if (category === "companies") return true;
  if (preference?.disliked) return false;
  if (category === "likes") return !!preference?.liked;
  return company.categories?.includes(category) || false;
}

function readPreferenceKeys(params: URLSearchParams, name: string) {
  return params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .filter((key) => key.length > 0 && key.length <= 160)
    .slice(0, 1000);
}

async function searchCatalog(params: URLSearchParams) {
  const requestedGroup = params.get("group");
  if (!companyGroupKeys.some((key) => key === requestedGroup)) {
    return NextResponse.json(
      { error: "Choose a valid company group." },
      { status: 400 },
    );
  }
  const group = requestedGroup as CompanyGroupKey;
  let catalog = fallbackCatalog;
  try {
    const savedCompanies = await getCompanies();
    catalog = savedCompanies.map((company) => ({
      ...company,
      categories: companyCategoryKeys(company),
    }));
  } catch {
    // Keep this category searchable when MongoDB is not configured.
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
  const page = Math.max(
    1,
    Math.min(100_000, Math.floor(Number(params.get("page")) || 1)),
  );
  const pageSize = [12, 24, 48].includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : 24;
  const category = params.get("tab") || "all";
  if (!knownCategories.has(category) && !["archived", "saved-jobs"].includes(category))
    return NextResponse.json(
      { error: "Unknown company category." },
      { status: 400 },
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
  let savedJobPreferences: { key: string; likedJobIds: string[]; addedJobs: CompanyCard["jobs"] }[] = [];
  try {
    const parsed = JSON.parse(params.get("savedJobs") || "[]");
    if (Array.isArray(parsed)) {
      savedJobPreferences = parsed.flatMap((item) =>
        item && typeof item.key === "string" && Array.isArray(item.likedJobIds)
          ? [{
              key: canonicalKeys.get(item.key) || item.key,
              likedJobIds: item.likedJobIds.filter((id: unknown): id is string => typeof id === "string"),
              addedJobs: Array.isArray(item.addedJobs) ? item.addedJobs : [],
            }]
          : [],
      );
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
      addedJobs: saved.addedJobs,
    };
  const filters: CompanyFilters = {
    query: (params.get("query") || "").slice(0, 160),
    technology: params.get("technology") || "all",
    role: params.get("role") || "all",
    level: params.get("level") || "all",
    region: params.get("region") || "all",
  };
  const researchOnly = params.get("researchOnly") === "true";
  const categoryCounts = Object.fromEntries(
    COMPANY_CATEGORIES.filter((item) => item.group !== "Job category").map(
      (item) => [
        item.key,
        catalog.filter((company) =>
          matchesCategory(company, item.key, preferences[company.key]),
        ).length,
      ],
    ),
  );
  for (const savedView of ["all", "likes", "dislikes"] as const) {
    categoryCounts[savedView] = catalog.filter((company) =>
      matchesCategory(company, savedView, preferences[company.key]),
    ).length;
  }
  categoryCounts.archived = catalog.filter((company) =>
    matchesCategory(company, "archived", preferences[company.key]),
  ).length;
  categoryCounts["saved-jobs"] = catalog.filter((company) =>
    matchesCategory(company, "saved-jobs", preferences[company.key]),
  ).length;
  const matched = category === "saved-jobs"
    ? savedJobPreferences.flatMap((saved) => {
        const company = catalog.find(
          (candidate) => candidate.key === saved.key || candidate.legacyKeys?.includes(saved.key),
        ) || catalog.find((candidate) =>
          candidate.jobs.some((job) => saved.likedJobIds.includes(job.id)),
        );
        if (!company) return [];
        const wanted = new Set(saved.likedJobIds);
        const isSaved = (job: CompanyCard["jobs"][number]) =>
          wanted.has(job.id) || wanted.has(job.url);
        const jobs = [...company.jobs, ...saved.addedJobs].filter(isSaved);
        return jobs.length && matchesCompanyFilters(company, filters)
          ? [{ ...company, jobs }]
          : [];
      })
    : catalog.filter(
        (company) =>
          (!researchOnly || category === "nearshore" || !!company.research) &&
          matchesCategory(company, category, preferences[company.key]) &&
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
      "technology",
      "role",
      "level",
      "region",
      "researchOnly",
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
