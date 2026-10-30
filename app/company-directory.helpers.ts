import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyCategory } from "@/lib/comp/categories";
import type { CompanyPreference } from "@/lib/comp/types";
import { matchesCompanyFilters, type CompanyFilters } from "@/lib/comp/catalog";
import { COMPANY_DIRECTORY_CACHE_KEY, type CompanyDirectoryCategory } from "./company-directory.constants";

export type CompanyDirectoryCache = {
  companies: CompanyCard[];
  categories: CompanyCategory[];
  savedAt: number;
};

export function readCompanyDirectoryCache(): CompanyDirectoryCache | null {
  try {
    const raw = localStorage.getItem(COMPANY_DIRECTORY_CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CompanyDirectoryCache>;
    if (!Array.isArray(value.companies) || !Array.isArray(value.categories)) return null;
    if (!value.companies.every(company => company && typeof company.key === "string" && Array.isArray(company.jobs))) return null;
    if (!value.categories.every(category => category && typeof category.key === "string" && typeof category.label === "string")) return null;
    return {
      companies: value.companies as CompanyCard[],
      categories: value.categories as CompanyCategory[],
      savedAt: typeof value.savedAt === "number" ? value.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeCompanyDirectoryCache(companies: CompanyCard[], categories: CompanyCategory[]) {
  try {
    const cache: CompanyDirectoryCache = { companies, categories, savedAt: Date.now() };
    localStorage.setItem(COMPANY_DIRECTORY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Keep browsing available if storage is disabled or full.
  }
}

export function safeCareersUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function matchesCompanyCategory(
  company: CompanyCard,
  category: CompanyDirectoryCategory,
  preference?: CompanyPreference,
) {
  if (category === "dislikes") return !!preference?.disliked;
  if (preference?.disliked) return false;
  if (category === "likes") return !!preference?.liked;
  if (category === "companies") return !preference?.liked;
  return company.categories?.includes(category) || false;
}

export function filterCompanyKeys(
  companies: CompanyCard[],
  category: CompanyDirectoryCategory,
  preferences: Record<string, CompanyPreference>,
  filters: CompanyFilters,
  researchOnly: boolean,
) {
  const source = researchOnly && category !== "nearshore"
    ? companies.filter(company => company.research)
    : companies;
  return source.filter(company =>
    matchesCompanyCategory(company, category, preferences[company.key])
      && matchesCompanyFilters(company, filters),
  ).map(company => company.key);
}
