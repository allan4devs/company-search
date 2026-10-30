"use client";

import { useCallback } from "react";
import { TARGET_COMPANIES, type CompanyCard } from "@/lib/comp/catalog";
import { COMPANY_PAGE_SIZES } from "../company-directory.constants";
import type { CompanyDirectoryViewData } from "../hooks/company-directory-view-types";
import { CompanyDirectoryHeader, CompanyDirectoryTopbar } from "./CompanyDirectoryHeader";
import { CompanyDirectoryFilters } from "./CompanyDirectoryFilters";
import { CompanyDirectoryStats } from "./CompanyDirectoryStats";
import { CompanyDirectoryPagination } from "./CompanyDirectoryPagination";
import { CompanyDirectoryCard } from "./CompanyDirectoryCard";
import styles from "./CompanyDirectoryView.module.css";

type Props = CompanyDirectoryViewData;

export function CompanyDirectoryView({ data, preferences, filtering }: Props) {
  const handleCopyError = useCallback(() => data.setNotice("Could not copy. Check clipboard permissions and try again."), [data.setNotice]);

  return <main className={`min-h-screen bg-zinc-950 text-zinc-100 ${styles.directory}`}>
    <CompanyDirectoryTopbar />
    <div className="mx-auto max-w-[1500px] px-4 py-10 sm:px-8">
      <CompanyDirectoryHeader companyCount={filtering.stats?.total || filtering.total} homepageCount={filtering.stats?.linked || 0} />
      <CompanyDirectoryStats companyCount={filtering.stats?.total || filtering.total} targetCount={TARGET_COMPANIES} midLevelCount={filtering.stats?.midLevel || 0} nearshoreCount={filtering.nearshoreCount} />
      <CompanyDirectoryFilters
        categories={data.categories} categoryCounts={filtering.categoryCounts} tab={filtering.tab}
        setTab={filtering.setTab} resetFilters={filtering.resetFilters} categoryJobCount={filtering.categoryJobCount}
        query={filtering.query} setQuery={filtering.setQuery} technology={filtering.technology} setTechnology={filtering.setTechnology}
        role={filtering.role} setRole={filtering.setRole} level={filtering.level} setLevel={filtering.setLevel}
        region={filtering.region} setRegion={filtering.setRegion} researchOnly={filtering.researchOnly}
        setResearchOnly={filtering.setResearchOnly} researchedCount={filtering.researchedCount}
        filtersOpen={filtering.filtersOpen} setFiltersOpen={filtering.setFiltersOpen} activeFilterCount={filtering.activeFilterCount}
      />
      {filtering.tab === "nearshore" ? <p className="mb-5 text-sm text-zinc-400">{filtering.nearshoreCount} nearshore companies serving US teams from Latin America. Company sources checked October 29, 2026. Openings and eligible countries vary by role. Like a company to also find it in Likes.</p> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400" aria-live="polite">
        <p>{filtering.filtering ? "Updating results…" : `Showing ${filtering.total ? ((filtering.currentPage - 1) * filtering.pageSize + 1).toLocaleString() : 0}–${Math.min(filtering.currentPage * filtering.pageSize, filtering.total).toLocaleString()} of ${filtering.total.toLocaleString()} matching companies`}</p>
        <label className="flex items-center gap-2 text-xs">Per page<select value={filtering.pageSize} onChange={event => filtering.changePageSize(Number(event.target.value))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white">{COMPANY_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      </div>
      <p className="mb-5 text-xs leading-5 text-zinc-500">Likes, dislikes, and careers links are saved {data.canSync ? "to your account" : "in this browser"}. Company sources and role boards were checked October 29, 2026. A company listing or seniority signal does not guarantee a current vacancy or country eligibility.</p>
      <p role="status" className="mb-4 text-sm text-amber-300">{data.notice}</p>
      {filtering.filterError ? <p role="alert" className="mb-4 text-sm text-amber-300">{filtering.filterError}</p> : null}
      {filtering.filterError ? <button type="button" onClick={filtering.retry} className="mb-4 rounded-lg bg-teal-400 px-4 py-2 text-zinc-950">Retry results</button> : null}
      <span role="status" className="sr-only">{preferences.copied ? "Copied to clipboard." : ""}</span>
      {data.loading ? <p role="status" className="mb-5 text-zinc-400">Loading companies…</p> : null}
      {data.loadError ? <button type="button" onClick={() => data.setReload(value => value + 1)} className="mb-5 rounded-lg bg-teal-400 px-4 py-2 text-zinc-950">Retry loading</button> : null}
      <div role="tabpanel" id="company-panel" aria-labelledby={`${filtering.tab}-tab`}>
        {filtering.tab !== "likes" && filtering.tab !== "dislikes" && !filtering.filtering && !data.loadError && !filtering.total ? <p className="mb-8 text-sm text-zinc-400">No companies match your search.</p> : null}
        {filtering.tab === "likes" && !filtering.filtering && !data.loadError && !filtering.total ? <p className="mb-8 text-sm text-zinc-400">No liked companies match this view. Like a company in the Companies tab to save it here.</p> : null}
        {filtering.tab === "dislikes" && !filtering.filtering && !data.loadError && !filtering.total ? <p className="mb-8 text-sm text-zinc-400">No disliked companies match this view. Dislike a company to return it to browsing.</p> : null}
        {filtering.groupResults.map(({ group, members, totalMembers }) => <section key={group.key} aria-labelledby={`${group.key}-heading`} className="mb-12">
          <div className="mb-5 border-b border-zinc-800 pb-5"><h2 id={`${group.key}-heading`} className="text-2xl font-semibold">{group.title} <span className="ml-2 text-base text-teal-300">{members.length} / {totalMembers}</span></h2><p className="mt-2 text-sm text-zinc-400">{group.description}</p></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{members.map((company: CompanyCard) => <CompanyDirectoryCard
            key={company.key} company={company} preference={preferences.preferences[company.key] || company.legacyKeys?.map(key => preferences.preferences[key]).find(Boolean)} tab={filtering.tab}
            copied={preferences.copied} ready={data.ready}
            reaction={preferences.reaction?.key === company.key ? { type: preferences.reaction.type, leaving: preferences.reaction.leaving } : null}
            onCopied={preferences.setCopied} onCopyError={handleCopyError} onPreferenceChange={preferences.updatePreference}
            onSaveCareers={preferences.saveCareers} onCancel={preferences.clearNotice}
          />)}</div>
        </section>)}
      </div>
      {filtering.total > filtering.pageSize ? <CompanyDirectoryPagination currentPage={filtering.currentPage} pageCount={filtering.pageCount} onPageChange={filtering.changePage} /> : null}
      <footer className="border-t border-zinc-800 py-5 text-xs text-zinc-500">Additional company profiles: <a href="https://remoteintech.company/" target="_blank" rel="noopener noreferrer" className="text-teal-300 underline">Remote In Tech</a>. Profile information is attributed on each card; employer feeds provide role evidence.</footer>
    </div>
  </main>;
}
