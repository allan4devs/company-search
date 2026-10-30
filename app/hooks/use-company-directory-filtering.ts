"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import { COMPANY_PAGE_SIZES, type CompanyDirectoryCategory } from "../company-directory.constants";

type CatalogResult = {
  companies: CompanyCard[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  categoryCounts: Record<string, number>;
  jobCounts: Record<string, number>;
  groupCounts: Record<string, number>;
  stats: { total: number; linked: number; nearshore: number; researched: number; midLevel: number };
};

type CompanyGroup = { key: string; title: string; description: string };

export function useCompanyDirectoryFiltering(
  companies: CompanyCard[], setCompanies: Dispatch<SetStateAction<CompanyCard[]>>,
  preferences: Record<string, CompanyPreference>, tab: CompanyDirectoryCategory,
  setTab: Dispatch<SetStateAction<CompanyDirectoryCategory>>,
) {
  const [researchOnly, setResearchOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [technology, setTechnology] = useState("all");
  const [role, setRole] = useState("all");
  const [level, setLevel] = useState("all");
  const [region, setRegion] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtering, setFiltering] = useState(true);
  const [filterError, setFilterError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [result, setResult] = useState<CatalogResult | null>(null);
  const companyFilters = useMemo(() => ({ query, technology, role, level, region }), [query, technology, role, level, region]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setFiltering(true);
      setFilterError("");
      try {
        const liked = Object.entries(preferences).filter(([, preference]) => preference.liked).map(([key]) => key);
        const disliked = Object.entries(preferences).filter(([, preference]) => preference.disliked).map(([key]) => key);
        const response = await fetch("/api/comp/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab, page, pageSize, ...companyFilters, researchOnly, liked, disliked }),
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Company results could not be loaded.");
        const next = payload as CatalogResult;
        setResult(next);
        setCompanies(next.companies);
        if (next.page !== page) setPage(next.page);
      } catch (error) {
        if (!controller.signal.aborted) setFilterError(error instanceof Error ? error.message : "Company results could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setFiltering(false);
      }
    }, query ? 180 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [tab, page, pageSize, companyFilters, researchOnly, preferences, retryKey, setCompanies]);

  const currentPage = result?.page || page;
  const pageCount = result?.pageCount || 1;
  const total = result?.total ?? companies.length;
  const groupResults = useMemo(() => {
    const groups: CompanyGroup[] = [
      { key: "outsourcing", title: "Outsourcing & consulting", description: "Development agencies, staff augmentation, recruiters, and consulting firms hiring for client teams." },
      { key: "unknown", title: "More engineering employers", description: "Additional software companies and technology teams. Review the company source for its business model." },
      { key: "direct", title: "Direct employers", description: "Companies hiring for their own products, platforms, or internal operations." },
    ];
    return groups.map(group => {
      const members = companies.filter(company => company.model === group.key);
      return { group, members, totalMembers: result?.groupCounts[group.key] ?? members.length };
    }).filter(item => item.members.length > 0);
  }, [companies, result]);
  const categoryJobCount = useCallback((category: CompanyDirectoryCategory) => result?.jobCounts[category] || 0, [result]);
  const activeFilterCount = useMemo(() => [query.trim(), technology !== "all", role !== "all", level !== "all", region !== "all", researchOnly && tab !== "nearshore"].filter(Boolean).length, [query, technology, role, level, region, researchOnly, tab]);
  const resetFilters = useCallback(() => { setQuery(""); setTechnology("all"); setRole("all"); setLevel("all"); setRegion("all"); setResearchOnly(false); setPage(1); }, []);
  const changePage = useCallback((nextPage: number) => setPage(Math.max(1, Math.min(Math.floor(nextPage) || 1, pageCount))), [pageCount]);
  const changePageSize = useCallback((requestedSize: number) => { setPageSize(COMPANY_PAGE_SIZES.find(size => size === requestedSize) || 24); setPage(1); }, []);
  const retry = useCallback(() => setRetryKey(value => value + 1), []);

  return {
    tab, setTab, researchOnly, setResearchOnly, query, setQuery, technology, setTechnology, role, setRole,
    level, setLevel, region, setRegion, page, pageSize, filtersOpen, setFiltersOpen, filtering, filterError,
    researchedCount: result?.stats.researched || 0, nearshoreCount: result?.stats.nearshore || 0,
    stats: result?.stats, total, pageCount, currentPage, pageCompanies: companies, groupResults, retry,
    categoryCounts: result?.categoryCounts || {}, categoryJobCount, activeFilterCount, resetFilters,
    changePage, changePageSize,
  };
}

export const CompanyDirectoryFiltering = useCompanyDirectoryFiltering;
