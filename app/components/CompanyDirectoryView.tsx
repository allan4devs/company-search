"use client";

import { useCallback, useMemo, useState } from "react";
import { TARGET_COMPANIES } from "@/lib/comp/catalog";
import type { CompanyDirectoryCategory, CompanyDirectoryGroupKey, CompanyDirectoryMainFilter } from "../company-directory.constants";
import { COMPANY_GROUPS } from "../company-directory.constants";
import type { CompanyDirectoryGroupSummaries, CompanyDirectoryGroupSummary, CompanyDirectoryViewData } from "../hooks/company-directory-view-types";
import { CompanyDirectoryHeader, CompanyDirectoryTopbar } from "./CompanyDirectoryHeader";
import { CompanyDirectoryTabs } from "./CompanyDirectoryTabs";
import { CompanyDirectoryStats } from "./CompanyDirectoryStats";
import { DirectEmployersDirectorySection } from "./DirectEmployersDirectorySection";
import { MoreEngineeringDirectorySection } from "./MoreEngineeringDirectorySection";
import { OutsourcingDirectorySection } from "./OutsourcingDirectorySection";
import styles from "./CompanyDirectoryView.module.css";

type Props = CompanyDirectoryViewData;

const emptyStats: CompanyDirectoryGroupSummary["stats"] = { total: 0, linked: 0, nearshore: 0, researched: 0, midLevel: 0 };

export function CompanyDirectoryView({ data, preferences, tab, setTab }: Props) {
  const [groupSummaries, setGroupSummaries] = useState<CompanyDirectoryGroupSummaries>({});
  const hasAllSummaries = COMPANY_GROUPS.every(group => groupSummaries[group.key]);
  const groupCounts = useMemo(() => {
    const counts: Partial<Record<CompanyDirectoryMainFilter, number>> = {};
    const savedViews: CompanyDirectoryCategory[] = ["all", "likes", "dislikes"];
    for (const group of COMPANY_GROUPS) {
      const summary = groupSummaries[group.key];
      if (!summary) continue;
      counts[group.key] = summary.stats.total;
    }
    if (hasAllSummaries) {
      for (const savedView of savedViews) {
        counts[savedView] = COMPANY_GROUPS.reduce((total, group) => total + (groupSummaries[group.key]?.categoryCounts[savedView] || 0), 0);
      }
    }
    return counts;
  }, [groupSummaries, hasAllSummaries]);
  const stats = useMemo(() => {
    if (!hasAllSummaries) return emptyStats;
    return COMPANY_GROUPS.reduce((total, group) => {
      const current = groupSummaries[group.key]?.stats;
      if (!current) return total;
      return {
        total: total.total + current.total,
        linked: total.linked + current.linked,
        nearshore: total.nearshore + current.nearshore,
        researched: total.researched + current.researched,
        midLevel: total.midLevel + current.midLevel,
      };
    }, emptyStats);
  }, [groupSummaries, hasAllSummaries]);
  const handleSummary = useCallback((key: CompanyDirectoryGroupKey, summary: CompanyDirectoryGroupSummary) => {
    setGroupSummaries(current => {
      const previous = current[key];
      if (previous
        && previous.total === summary.total
        && JSON.stringify(previous.categoryCounts) === JSON.stringify(summary.categoryCounts)
        && JSON.stringify(previous.stats) === JSON.stringify(summary.stats)) return current;
      return { ...current, [key]: summary };
    });
  }, []);
  const showAllGroups = tab === "all" || tab === "likes" || tab === "dislikes";
  return <main className={`min-h-screen bg-zinc-950 text-zinc-100 ${styles.directory}`}>
    <CompanyDirectoryTopbar />
    <div className="mx-auto max-w-[1500px] px-4 py-10 sm:px-8">
      <CompanyDirectoryHeader companyCount={stats.total} homepageCount={stats.linked} />
      <CompanyDirectoryStats companyCount={stats.total} targetCount={TARGET_COMPANIES} midLevelCount={stats.midLevel} nearshoreCount={stats.nearshore} />
      <CompanyDirectoryTabs tab={tab} setTab={setTab} groupCounts={groupCounts} />
      <p className="mb-5 text-xs leading-5 text-zinc-500">Likes, dislikes, and careers links use a shared profile visible to every visitor and sync across devices when MongoDB is available. If sync is unavailable, changes are saved in this browser. Company sources and role boards were checked October 29, 2026. A company listing or seniority signal does not guarantee a current vacancy or country eligibility.</p>
      <p role="status" className="mb-4 text-sm text-amber-300">{data.notice}</p>
      <span role="status" className="sr-only">{preferences.copied ? "Copied to clipboard." : ""}</span>
      {data.loading ? <p role="status" className="mb-5 text-zinc-400">Loading preferences…</p> : null}
      {data.loadError ? <button type="button" onClick={() => data.setReload(value => value + 1)} className="mb-5 rounded-lg bg-teal-400 px-4 py-2 text-zinc-950">Retry loading</button> : null}
      <div role="tabpanel" id="company-panel" aria-labelledby={`${tab}-tab`}>
        <OutsourcingDirectorySection filter={tab} active={showAllGroups || tab === "outsourcing"} data={data} preferences={preferences} onSummary={handleSummary} />
        <MoreEngineeringDirectorySection filter={tab} active={showAllGroups || tab === "unknown"} data={data} preferences={preferences} onSummary={handleSummary} />
        <DirectEmployersDirectorySection filter={tab} active={showAllGroups || tab === "direct"} data={data} preferences={preferences} onSummary={handleSummary} />
      </div>
      <footer className="border-t border-zinc-800 py-5 text-xs text-zinc-500">Additional company profiles: <a href="https://remoteintech.company/" target="_blank" rel="noopener noreferrer" className="text-teal-300 underline">Remote In Tech</a>. Profile information is attributed on each card; employer feeds provide role evidence.</footer>
    </div>
  </main>;
}
