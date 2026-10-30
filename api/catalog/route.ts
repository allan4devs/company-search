import { NextRequest, NextResponse } from "next/server";
import { companies as sourceCompanies } from "@/lib/comp/companies";
import { companyCategoryKeys, COMPANY_CATEGORIES } from "@/lib/comp/categories";
import { companyJobCategory, companySignals, matchesCompanyFilters, type CompanyCard, type CompanyFilters } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";

export const runtime = "nodejs";
export const revalidate = 3600;

const catalog = sourceCompanies.map(company => ({ ...company, categories: companyCategoryKeys(company) }));
const jobCounts = catalog.reduce<Record<string, number>>((counts, company) => {
  for (const job of company.jobs) {
    const key = companyJobCategory(job);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}, {});
const totalStats = {
  total: catalog.length,
  linked: catalog.filter(company => company.website).length,
  nearshore: catalog.filter(company => company.nearshore).length,
  researched: catalog.filter(company => company.research).length,
  midLevel: catalog.filter(company => companySignals(company).levels.includes("Mid-level")).length,
};
const knownCategories = new Set(COMPANY_CATEGORIES.map(category => category.key));
const canonicalKeys = new Map(catalog.flatMap(company => [company.key, ...(company.legacyKeys || [])].map(key => [key, company.key] as const)));

function matchesCategory(company: CompanyCard, category: string, preference?: CompanyPreference) {
  if (category === "dislikes") return !!preference?.disliked;
  if (preference?.disliked) return false;
  if (category === "likes") return !!preference?.liked;
  if (category === "companies") return !preference?.liked;
  return company.categories?.includes(category) || false;
}

function readPreferenceKeys(params: URLSearchParams, name: string) {
  return params.getAll(name).flatMap(value => value.split(",")).filter(key => key.length > 0 && key.length <= 160).slice(0, 1000);
}

function searchCatalog(params: URLSearchParams) {
  const page = Math.max(1, Math.min(100_000, Number(params.get("page")) || 1));
  const pageSize = [12, 24, 48].includes(Number(params.get("pageSize"))) ? Number(params.get("pageSize")) : 24;
  const category = params.get("tab") || "companies";
  if (!knownCategories.has(category)) return NextResponse.json({ error: "Unknown company category." }, { status: 400 });
  const liked = new Set(readPreferenceKeys(params, "liked").map(key => canonicalKeys.get(key) || key));
  const disliked = new Set(readPreferenceKeys(params, "disliked").map(key => canonicalKeys.get(key) || key));
  const preferences: Record<string, CompanyPreference> = {};
  for (const key of liked) preferences[key] = { ...(preferences[key] || {}), liked: true };
  for (const key of disliked) preferences[key] = { ...(preferences[key] || {}), disliked: true };
  const filters: CompanyFilters = {
    query: (params.get("query") || "").slice(0, 160),
    technology: params.get("technology") || "all",
    role: params.get("role") || "all",
    level: params.get("level") || "all",
    region: params.get("region") || "all",
  };
  const researchOnly = params.get("researchOnly") === "true";
  const categoryCounts = Object.fromEntries(COMPANY_CATEGORIES.filter(item => item.group !== "Job category").map(item => [
    item.key,
    catalog.filter(company => matchesCategory(company, item.key, preferences[company.key])).length,
  ]));
  const matched = catalog.filter(company =>
    (!researchOnly || category === "nearshore" || !!company.research)
    && matchesCategory(company, category, preferences[company.key])
    && matchesCompanyFilters(company, filters),
  );
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageCompanies = matched.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const groupCounts = matched.reduce<Record<string, number>>((counts, company) => {
    counts[company.model] = (counts[company.model] || 0) + 1;
    return counts;
  }, {});
  return NextResponse.json({
    companies: pageCompanies,
    total: matched.length,
    page: currentPage,
    pageCount,
    pageSize,
    categoryCounts,
    jobCounts,
    groupCounts,
    stats: totalStats,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  return searchCatalog(request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length")) > 300_000) return NextResponse.json({ error: "Search request is too large." }, { status: 413 });
    const body = await request.json();
    const params = new URLSearchParams();
    for (const key of ["tab", "page", "pageSize", "query", "technology", "role", "level", "region", "researchOnly"]) {
      if (typeof body[key] === "string" || typeof body[key] === "number" || typeof body[key] === "boolean") params.set(key, String(body[key]));
    }
    if (Array.isArray(body.liked)) for (const key of body.liked.slice(0, 1000)) if (typeof key === "string" && key.length <= 160) params.append("liked", key);
    if (Array.isArray(body.disliked)) for (const key of body.disliked.slice(0, 1000)) if (typeof key === "string" && key.length <= 160) params.append("disliked", key);
    return searchCatalog(params);
  } catch {
    return NextResponse.json({ error: "Invalid company search request." }, { status: 400 });
  }
}
