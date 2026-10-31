"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
import type { CompanyDirectoryCategory } from "../company-directory.constants";

type CatalogResult = {
  companies: CompanyCard[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  categoryCounts: Record<string, number>;
  groupCounts: Record<string, number>;
  stats: { total: number; linked: number; nearshore: number; researched: number; midLevel: number };
};

type CompanyGroup = { key: string; title: string; description: string };

const PAGE_SIZE = 24;

export function useCompanyDirectoryFiltering(
  companies: CompanyCard[], setCompanies: Dispatch<SetStateAction<CompanyCard[]>>,
  preferences: Record<string, CompanyPreference>, tab: CompanyDirectoryCategory,
  setTab: Dispatch<SetStateAction<CompanyDirectoryCategory>>,
) {
  const [page, setPage] = useState(1);
  const [filtering, setFiltering] = useState(true);
  const [filterError, setFilterError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [result, setResult] = useState<CatalogResult | null>(null);
  const selectTab = useCallback((nextTab: SetStateAction<CompanyDirectoryCategory>) => {
    setTab(nextTab);
    setPage(1);
  }, [setTab]);

  useEffect(() => {
    const controller = new AbortController();
    const liked = Object.entries(preferences).filter(([, preference]) => preference.liked).map(([key]) => key);
    const disliked = Object.entries(preferences).filter(([, preference]) => preference.disliked).map(([key]) => key);
    setFiltering(true);
    setFilterError("");
    fetch("/api/comp/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab, page, pageSize: PAGE_SIZE, liked, disliked }),
      signal: controller.signal,
    }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Company results could not be loaded.");
      return payload as CatalogResult;
    }).then(next => {
      setResult(next);
      setCompanies(next.companies);
      if (next.page !== page) setPage(next.page);
    }).catch(error => {
      if (!controller.signal.aborted) setFilterError(error instanceof Error ? error.message : "Company results could not be loaded.");
    }).finally(() => {
      if (!controller.signal.aborted) setFiltering(false);
    });
    return () => controller.abort();
  }, [tab, page, preferences, retryKey, setCompanies]);

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
      return { group, members, totalMembers: result?.groupCounts?.[group.key] ?? members.length };
    }).filter(item => item.members.length > 0);
  }, [companies, result]);
  const changePage = useCallback((nextPage: number) => setPage(Math.max(1, Math.min(Math.floor(nextPage) || 1, pageCount))), [pageCount]);
  const retry = useCallback(() => setRetryKey(value => value + 1), []);

  return {
    tab, setTab: selectTab, page, filtering, filterError,
    nearshoreCount: result?.stats.nearshore || 0, stats: result?.stats, total, pageCount,
    currentPage, pageSize: PAGE_SIZE, pageCompanies: companies, groupResults, retry,
    categoryCounts: result?.categoryCounts || {}, changePage,
  };
}

export const CompanyDirectoryFiltering = useCompanyDirectoryFiltering;
