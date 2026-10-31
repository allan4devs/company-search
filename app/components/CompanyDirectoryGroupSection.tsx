"use client";

import { useEffect, useState } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type {
  CompanyDirectoryGroup,
  CompanyDirectoryMainFilter,
} from "../company-directory.constants";
import type {
  CompanyDirectoryGroupSummary,
  CompanyDirectoryViewData,
} from "../hooks/company-directory-view-types";
import { CompanyDirectoryPagination } from "./CompanyDirectoryPagination";
import { CompanyDirectoryCard } from "./CompanyDirectoryCard";
import { matchesCompanyCategory } from "../company-directory.helpers";

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
  keywordQuery: string;
  active: boolean;
  data: CompanyDirectoryViewData["data"];
  preferences: CompanyDirectoryViewData["preferences"];
  onSummary: (
    key: CompanyDirectoryGroup["key"],
    summary: CompanyDirectoryGroupSummary,
  ) => void;
  onOpenCompany: (company: CompanyCard) => void;
  selectedCompanyKey?: string;
};

const PAGE_SIZE = 24;

export function CompanyDirectoryGroupSection({
  group,
  filter,
  keywordQuery,
  active,
  data,
  preferences,
  onSummary,
  onOpenCompany,
  selectedCompanyKey,
}: CompanyDirectoryGroupSectionProps) {
  const [pages, setPages] = useState<
    Record<CompanyDirectoryMainFilter, number>
  >({
    all: 1,
    likes: 1,
    dislikes: 1,
    archived: 1,
    companies: 1,
  });
  const [resultState, setResultState] = useState<{
    filter: CompanyDirectoryMainFilter;
    result: CatalogGroupResult;
  } | null>(null);
  const [requestState, setRequestState] = useState<{
    key: string;
    error: string;
  } | null>(null);
  const { setCompanies } = data;
  const [retryKey, setRetryKey] = useState(0);
  const page = pages[filter];
  const result = resultState?.filter === filter ? resultState.result : null;
  const queryTab = filter === "companies" ? "companies" : filter;

  const requestKey = JSON.stringify([
    group.key,
    filter,
    page,
    keywordQuery,
    retryKey,
  ]);
  const loading = requestState?.key !== requestKey;
  const error = requestState?.key === requestKey ? requestState.error : "";

  useEffect(() => {
    const controller = new AbortController();
    const savedPreferences = preferences.preferences;
    const liked = Object.entries(savedPreferences)
      .filter(([, preference]) => preference.liked)
      .map(([key]) => key);
    const disliked = Object.entries(savedPreferences)
      .filter(([, preference]) => preference.disliked)
      .map(([key]) => key);
    const archived = Object.entries(savedPreferences)
      .filter(([, preference]) => preference.archived)
      .map(([key]) => key);
    const savedJobs = Object.entries(savedPreferences)
      .filter(([, preference]) => (preference.likedJobIds || []).length > 0)
      .map(([key]) => key);
    fetch("/api/comp/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: group.key,
        tab: queryTab,
        page,
        pageSize: PAGE_SIZE,
        query: keywordQuery.trim(),
        liked,
        disliked,
        archived,
        savedJobs,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.error || "Company results could not be loaded.",
          );
        return payload as CatalogGroupResult;
      })
      .then((next) => {
        if (controller.signal.aborted) return;
        setResultState({ filter, result: next });
        setCompanies((current) => [
          ...current.filter(
            (company) =>
              !next.companies.some(
                (nextCompany) => nextCompany.key === company.key,
              ),
          ),
          ...next.companies,
        ]);
        setRequestState({ key: requestKey, error: "" });
        onSummary(group.key, {
          total: next.total,
          categoryCounts: next.categoryCounts,
          stats: next.stats,
        });
        setPages((current) =>
          current[filter] === next.page
            ? current
            : { ...current, [filter]: next.page },
        );
      })
      .catch((requestError) => {
        if (!controller.signal.aborted)
          setRequestState({
            key: requestKey,
            error:
              requestError instanceof Error
                ? requestError.message
                : "Company results could not be loaded.",
          });
      });
    return () => controller.abort();
  }, [
    setCompanies,
    filter,
    group.key,
    onSummary,
    page,
    keywordQuery,
    queryTab,
    requestKey,
  ]);

  const changePage = (nextPage: number) => {
    setPages((current) => ({
      ...current,
      [filter]: Math.max(
        1,
        Math.min(Math.floor(nextPage) || 1, result?.pageCount ?? 1),
      ),
    }));
  };
  const rangeStart = result?.total ? (result.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = result ? Math.min(result.page * PAGE_SIZE, result.total) : 0;
  const visibleCompanies = result?.companies.filter((company) => {
    const preference =
      preferences.preferences[company.key] ||
      company.legacyKeys
        ?.map((key) => preferences.preferences[key])
        .find(Boolean);
    return matchesCompanyCategory(company, queryTab, preference);
  });

  return (
    <section
      hidden={!active}
      aria-labelledby={`${group.key}-heading`}
      className="mb-12"
    >
      <div className="mb-5 border-b border-zinc-800 pb-5">
        <h2 id={`${group.key}-heading`} className="text-2xl font-semibold">
          {group.title}
          <span className="ml-2 text-base text-teal-300">
            {result
              ? `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${result.total.toLocaleString()}`
              : loading
                ? "Loading…"
                : ""}
          </span>
        </h2>
        <p className="mt-2 text-sm text-zinc-400">{group.description}</p>
      </div>
      {result ? (
        <CompanyDirectoryPagination
          currentPage={result.page}
          pageCount={result.pageCount}
          ariaLabel={`${group.title} pages`}
          onPageChange={changePage}
        />
      ) : null}
      {error ? (
        <div className="mb-5" role="alert">
          <p className="mb-3 text-sm text-amber-300">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
            className="rounded-lg bg-teal-400 px-4 py-2 text-zinc-950"
          >
            Retry {group.title.toLowerCase()}
          </button>
        </div>
      ) : null}
      {result && !visibleCompanies?.length && !loading ? (
        <p className="mb-5 text-sm text-zinc-400">
          No companies match this view.
        </p>
      ) : null}
      {loading ? (
        <div
          role="status"
          aria-label="Loading companies"
          className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4"
        >
          <span className="sr-only">Loading companies…</span>
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-zinc-800" />
                <div className="h-5 w-2/5 rounded bg-zinc-800" />
              </div>
              <div className="mt-5 h-5 w-4/5 rounded bg-zinc-800" />
              <div className="mt-3 h-4 w-3/5 rounded bg-zinc-800" />
              <div className="mt-6 h-9 w-2/5 rounded-lg bg-zinc-800" />
            </div>
          ))}
        </div>
      ) : visibleCompanies?.length ? (
        <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4">
          {visibleCompanies.map((company) => (
            <CompanyDirectoryCard
              key={company.key}
              company={company}
              preference={
                preferences.preferences[company.key] ||
                company.legacyKeys
                  ?.map((key) => preferences.preferences[key])
                  .find(Boolean)
              }
              reaction={
                preferences.reaction?.key === company.key
                  ? {
                      type: preferences.reaction.type,
                      leaving: preferences.reaction.leaving,
                    }
                  : null
              }
              onOpenCompany={onOpenCompany}
              onPreferenceChange={preferences.updatePreference}
              selected={selectedCompanyKey === company.key}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
