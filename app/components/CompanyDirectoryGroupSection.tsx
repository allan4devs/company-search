"use client";

import { useCallback, useEffect, useState } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyDirectoryGroup, CompanyDirectoryMainFilter } from "../company-directory.constants";
import type { CompanyDirectoryGroupSummary, CompanyDirectoryViewData } from "../hooks/company-directory-view-types";
import { CompanyDirectoryPagination } from "./CompanyDirectoryPagination";
import { CompanyDirectoryCard } from "./CompanyDirectoryCard";

type CatalogGroupResult = {
  companies: CompanyCard[];
  total: number;
  page: number;
  pageCount: number;
  categoryCounts: Record<string, number>;
  stats: CompanyDirectoryGroupSummary["stats"];
};

export type CompanyDirectoryGroupSectionProps = {
  group: CompanyDirectoryGroup;
  filter: CompanyDirectoryMainFilter;
  active: boolean;
  data: CompanyDirectoryViewData["data"];
  preferences: CompanyDirectoryViewData["preferences"];
  onSummary: (key: CompanyDirectoryGroup["key"], summary: CompanyDirectoryGroupSummary) => void;
};

const PAGE_SIZE = 24;

export function CompanyDirectoryGroupSection({ group, filter, active, data, preferences, onSummary }: CompanyDirectoryGroupSectionProps) {
  const [pages, setPages] = useState<Record<CompanyDirectoryMainFilter, number>>({
    all: 1, likes: 1, dislikes: 1, outsourcing: 1, unknown: 1, direct: 1,
  });
  const [resultState, setResultState] = useState<{ filter: CompanyDirectoryMainFilter; result: CatalogGroupResult } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const page = pages[filter];
  const result = resultState?.filter === filter ? resultState.result : null;
  const queryTab = filter === "outsourcing" || filter === "unknown" || filter === "direct" ? "companies" : filter;

  useEffect(() => {
    const controller = new AbortController();
    const savedPreferences = preferences.preferences;
    const liked = Object.entries(savedPreferences).filter(([, preference]) => preference.liked).map(([key]) => key);
    const disliked = Object.entries(savedPreferences).filter(([, preference]) => preference.disliked).map(([key]) => key);
    setLoading(true);
    setError("");
    fetch("/api/comp/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: group.key, tab: queryTab, page, pageSize: PAGE_SIZE, liked, disliked }),
      signal: controller.signal,
    }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Company results could not be loaded.");
      return payload as CatalogGroupResult;
    }).then(next => {
      if (controller.signal.aborted) return;
      setResultState({ filter, result: next });
      data.setCompanies(current => [
        ...current.filter(company => company.model !== group.key),
        ...next.companies,
      ]);
      onSummary(group.key, { total: next.total, categoryCounts: next.categoryCounts, stats: next.stats });
      setPages(current => current[filter] === next.page ? current : { ...current, [filter]: next.page });
    }).catch(requestError => {
      if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "Company results could not be loaded.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [data.setCompanies, filter, group.key, onSummary, page, preferences.preferences, queryTab, retryKey]);

  const handleCopyError = useCallback(() => data.setNotice("Could not copy. Check clipboard permissions and try again."), [data.setNotice]);
  const changePage = (nextPage: number) => {
    setPages(current => ({
      ...current,
      [filter]: Math.max(1, Math.min(Math.floor(nextPage) || 1, result?.pageCount ?? 1)),
    }));
  };
  const rangeStart = result?.total ? (result.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = result ? Math.min(result.page * PAGE_SIZE, result.total) : 0;

  return <section hidden={!active} aria-labelledby={`${group.key}-heading`} className="mb-12">
    <div className="mb-5 border-b border-zinc-800 pb-5">
      <h2 id={`${group.key}-heading`} className="text-2xl font-semibold">
        {group.title}
        <span className="ml-2 text-base text-teal-300">{result ? `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${result.total.toLocaleString()}` : loading ? "Loading…" : ""}</span>
      </h2>
      <p className="mt-2 text-sm text-zinc-400">{group.description}</p>
    </div>
    {loading && !result ? <p role="status" className="mb-5 text-zinc-400">Loading companies…</p> : null}
    {error ? <div className="mb-5" role="alert">
      <p className="mb-3 text-sm text-amber-300">{error}</p>
      <button type="button" onClick={() => setRetryKey(value => value + 1)} className="rounded-lg bg-teal-400 px-4 py-2 text-zinc-950">Retry {group.title.toLowerCase()}</button>
    </div> : null}
    {result && !result.total && !loading ? <p className="mb-5 text-sm text-zinc-400">No companies match this view.</p> : null}
    {result?.companies.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {result.companies.map(company => <CompanyDirectoryCard
        key={company.key}
        company={company}
        preference={preferences.preferences[company.key] || company.legacyKeys?.map(key => preferences.preferences[key]).find(Boolean)}
        copied={preferences.copied}
        ready={data.ready}
        reaction={preferences.reaction?.key === company.key ? { type: preferences.reaction.type, leaving: preferences.reaction.leaving } : null}
        onCopied={preferences.setCopied}
        onCopyError={handleCopyError}
        onPreferenceChange={preferences.updatePreference}
        onSaveCareers={preferences.saveCareers}
        onCancel={preferences.clearNotice}
      />)}
    </div> : null}
    {result ? <CompanyDirectoryPagination
      currentPage={result.page}
      pageCount={result.pageCount}
      ariaLabel={`${group.title} pages`}
      onPageChange={changePage}
    /> : null}
  </section>;
}
