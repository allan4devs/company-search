"use client";

// @refresh reset

import { useEffect, useRef, useState } from "react";
import type { CompanyCard } from "@/lib/comp/catalog";
import type { CompanyPreference } from "@/lib/comp/types";
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

type CatalogGroupResult = {
  companies: CompanyCard[];
  total: number;
  page: number;
  pageCount: number;
  countryOptions: string[];
  categoryCounts: Record<string, number>;
  stats: CompanyDirectoryGroupSummary["stats"];
};

export type CompanyDirectoryGroupSectionProps = {
  group: CompanyDirectoryGroup;
  filter: CompanyDirectoryMainFilter;
  keywordQuery: string;
  latamCostaRicaFilter: boolean;
  hideWithoutDomain: boolean;
  country: string;
  active: boolean;
  data: CompanyDirectoryViewData["data"];
  preferences: CompanyDirectoryViewData["preferences"];
  onSummary: (
    key: CompanyDirectoryGroup["key"],
    summary: CompanyDirectoryGroupSummary,
  ) => void;
  onVisibleCompaniesChange: (
    filter: CompanyDirectoryMainFilter,
    companies: CompanyCard[],
  ) => void;
  onCountryOptionsChange: (countries: string[]) => void;
  onOpenCompany: (company: CompanyCard) => void;
  onPreferenceChange: CompanyDirectoryViewData["preferences"]["updatePreference"];
  selectedCompanyKey?: string;
};

const PAGE_SIZE = 24;

export function CompanyDirectoryGroupSection({
  group,
  filter,
  keywordQuery,
  latamCostaRicaFilter,
  hideWithoutDomain,
  country,
  active,
  data,
  preferences,
  onSummary,
  onVisibleCompaniesChange,
  onCountryOptionsChange,
  onOpenCompany,
  onPreferenceChange,
  selectedCompanyKey,
}: CompanyDirectoryGroupSectionProps) {
  const [pages, setPages] = useState<
    Record<CompanyDirectoryMainFilter, number>
  >({
    all: 1,
    new: 1,
    likes: 1,
    dislikes: 1,
    archived: 1,
    "saved-jobs": 1,
  });
  const [resultState, setResultState] = useState<{
    filter: CompanyDirectoryMainFilter;
    result: CatalogGroupResult;
  } | null>(null);
  const [requestState, setRequestState] = useState<{
    key: string;
    error: string;
  } | null>(null);
  const [dismissedCompanies, setDismissedCompanies] = useState<{
    requestKey: string;
    keys: Set<string>;
  }>({ requestKey: "", keys: new Set() });
  const { setCompanies } = data;
  const [retryKey, setRetryKey] = useState(0);
  const page = pages[filter] ?? 1;
  const result = resultState?.filter === filter ? resultState.result : null;
  const queryTab = filter;

  const catalogPreferencesKey = JSON.stringify(
    Object.entries(preferences.preferences)
      .filter(([, preference]) => preference.liked || preference.disliked || preference.archived || preference.likedJobIds?.length)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, preference]) => [key, {
        liked: !!preference.liked,
        disliked: !!preference.disliked,
        archived: !!preference.archived,
        likedJobIds: [...(preference.likedJobIds || [])].sort(),
        addedJobs: preference.likedJobIds?.length ? preference.addedJobs || [] : [],
      }]),
  );
  const catalogPreferencesRef = useRef(catalogPreferencesKey);
  catalogPreferencesRef.current = catalogPreferencesKey;
  const requestKey = JSON.stringify([
    group.key,
    filter,
    page,
    keywordQuery,
    latamCostaRicaFilter,
    hideWithoutDomain,
    country,
    retryKey,
  ]);
  const loading = requestState?.key !== requestKey;
  const error = requestState?.key === requestKey ? requestState.error : "";

  useEffect(() => {
    const controller = new AbortController();
    const savedPreferences = Object.fromEntries(JSON.parse(catalogPreferencesRef.current)) as Record<string, CompanyPreference>;
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
      .map(([key, preference]) => ({ key, likedJobIds: preference.likedJobIds, addedJobs: preference.addedJobs || [] }));
    fetch("/api/comp/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: group.key,
        tab: queryTab,
        page,
        pageSize: PAGE_SIZE,
        query: keywordQuery.trim(),
        latamCostaRicaFilter,
        hideWithoutDomain,
        country,
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
        setDismissedCompanies((current) =>
          current.requestKey === requestKey
            ? { requestKey, keys: new Set() }
            : current,
        );
        onVisibleCompaniesChange(filter, next.companies);
        onCountryOptionsChange(next.countryOptions);
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
    latamCostaRicaFilter,
    hideWithoutDomain,
    country,
    queryTab,
    requestKey,
    onVisibleCompaniesChange,
    onCountryOptionsChange,
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
  const handlePreferenceChange = async (
    key: string,
    change: CompanyPreference,
    reactionType?: "like" | "dislike",
  ) => {
    if (reactionType) {
      setDismissedCompanies((current) => ({
        requestKey,
        keys: new Set(
          current.requestKey === requestKey ? [...current.keys, key] : [key],
        ),
      }));
    }
    const saved = await onPreferenceChange(key, change, reactionType);
    if (!saved && reactionType) {
      setDismissedCompanies((current) => {
        if (current.requestKey !== requestKey) return current;
        const keys = new Set(current.keys);
        keys.delete(key);
        return { requestKey, keys };
      });
    }
    return saved;
  };
  const rangeStart = result?.total ? (result.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = result ? Math.min(result.page * PAGE_SIZE, result.total) : 0;
  // The API already applies the selected category, preferences, and keyword
  // filters. Reapplying the category here loses server-only context such as
  // the latest batch ID and can incorrectly hide valid results.
  const visibleCompanies = result?.companies.filter(
    (company) =>
      dismissedCompanies.requestKey !== requestKey ||
      !dismissedCompanies.keys.has(company.key),
  );

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
          {filter === "saved-jobs"
            ? visibleCompanies.flatMap((company) =>
                company.jobs.map((job) => (
                  <article
                    key={`${company.key}:${job.id}`}
                    className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 transition hover:border-teal-400/60"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-zinc-100">{job.title || "Open role"}</h3>
                      <p className="mt-1 truncate text-xs text-zinc-400">{company.name}{job.location ? ` · ${job.location}` : ""}{job.workMode ? ` · ${job.workMode}` : ""}</p>
                    </div>
                    <a href={job.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${job.title || "job"} at ${company.name}`} className="shrink-0 rounded-lg bg-teal-300 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-teal-200">Open</a>
                  </article>
                )),
              )
            : visibleCompanies.map((company) => (
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
              onPreferenceChange={handlePreferenceChange}
              selected={selectedCompanyKey === company.key}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
