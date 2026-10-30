import { ChevronDown } from "lucide-react";
import { memo, type Dispatch, type SetStateAction } from "react";
import type { CompanyCategory } from "@/lib/comp/categories";
import { LEVELS, ROLE_TYPES, TECHNOLOGIES } from "@/lib/comp/catalog";
import type { CompanyDirectoryCategory } from "../company-directory.constants";

type Props = {
  categories: CompanyCategory[];
  categoryCounts: Record<string, number>;
  tab: CompanyDirectoryCategory;
  setTab: Dispatch<SetStateAction<CompanyDirectoryCategory>>;
  resetFilters: () => void;
  categoryJobCount: (category: string) => number;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  technology: string;
  setTechnology: Dispatch<SetStateAction<string>>;
  role: string;
  setRole: Dispatch<SetStateAction<string>>;
  level: string;
  setLevel: Dispatch<SetStateAction<string>>;
  region: string;
  setRegion: Dispatch<SetStateAction<string>>;
  researchOnly: boolean;
  setResearchOnly: Dispatch<SetStateAction<boolean>>;
  researchedCount: number;
  filtersOpen: boolean;
  setFiltersOpen: Dispatch<SetStateAction<boolean>>;
  activeFilterCount: number;
};

function CompanyDirectoryFiltersView(props: Props) {
  const {
    categories, categoryCounts, tab, setTab, resetFilters, categoryJobCount,
    query, setQuery, technology, setTechnology, role, setRole, level, setLevel,
    region, setRegion, researchOnly, setResearchOnly, researchedCount,
    filtersOpen, setFiltersOpen, activeFilterCount,
  } = props;
  const selectTab = (key: string) => {
    setTab(key);
    resetFilters();
  };

  return <section aria-label="Company filters" className="mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
    <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-5">
      <label className="text-xs font-medium text-zinc-400">
        Search companies or roles
        <input type="search" maxLength={160} value={query} onChange={event => setQuery(event.target.value)} placeholder="Company, technology, job title, or location" className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white placeholder:text-zinc-600" />
      </label>
      <div className="flex gap-2">
        <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-800">
          <ChevronDown size={16} className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />Filters
          {activeFilterCount ? <span className="rounded-full bg-teal-400 px-2 py-0.5 text-xs text-zinc-950">{activeFilterCount}</span> : null}
        </button>
        {activeFilterCount ? <button type="button" onClick={resetFilters} className="rounded-xl px-3 text-sm text-zinc-400 hover:text-white">Clear</button> : null}
      </div>
    </div>
    {filtersOpen ? <div className="grid gap-3 border-t border-zinc-800 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
      {[
        { label: "Technology", value: technology, values: TECHNOLOGIES, change: setTechnology },
        { label: "Role type", value: role, values: ROLE_TYPES, change: setRole },
        { label: "Seniority signal", value: level, values: LEVELS, change: setLevel },
      ].map(filter => <label key={filter.label} className="text-xs text-zinc-400">{filter.label}
        <select value={filter.value} onChange={event => filter.change(event.target.value)} className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white">
          <option value="all">All</option>{filter.values.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>)}
      <label className="text-xs text-zinc-400">Reported hiring region
        <select value={region} onChange={event => setRegion(event.target.value)} className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white">
          <option value="all">All regions</option><option value="global">Worldwide / global</option><option value="americas">Americas / LATAM</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2 lg:col-span-4">
        <input type="checkbox" disabled={tab === "nearshore"} checked={researchOnly && tab !== "nearshore"} onChange={event => setResearchOnly(event.target.checked)} /> LATAM hiring evidence only ({researchedCount})
      </label>
    </div> : null}
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <div role="tablist" aria-label="Company views and job categories" className="flex flex-wrap gap-2 pb-1">
        {categories.filter(category => category.group === "Browse" || category.group === "Saved" || category.group === "Job category").map(({ key, label, group }) => <button key={key} type="button" role="tab" id={`${key}-tab`} aria-selected={tab === key} aria-controls="company-panel" onClick={() => selectTab(key)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${tab === key ? "bg-teal-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
          {label}<span className={`ml-2 text-xs ${tab === key ? "text-zinc-800" : "text-zinc-500"}`}>{group === "Job category" ? `${categoryJobCount(key)} jobs` : categoryCounts[key] === undefined ? "…" : categoryCounts[key].toLocaleString()}</span>
        </button>)}
      </div>
      <details className="group mt-3 border-t border-zinc-800 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-zinc-400 marker:hidden">
          Browse by profile signal<span className="flex items-center gap-2 text-zinc-500">{categories.filter(category => !["Browse", "Saved", "Job category"].includes(category.group)).length} views <ChevronDown size={14} className="transition-transform group-open:rotate-180" /></span>
        </summary>
        <p className="mt-2 text-xs leading-5 text-zinc-500">Counts show each full category before search and advanced filters. Companies with missing evidence remain in the unspecified groups.</p>
        <div className="mt-3 space-y-3">{[...new Set(categories.map(category => category.group))].filter(group => group !== "Browse" && group !== "Saved" && group !== "Job category").map(group => <div key={group} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <p className="w-28 shrink-0 pt-2 text-xs font-semibold text-zinc-500">{group}</p>
          <div className="flex flex-wrap gap-2">{categories.filter(category => category.group === group).map(({ key, label }) => <button key={key} type="button" onClick={() => selectTab(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === key ? "bg-teal-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
            {label} ({categoryCounts[key] === undefined ? "…" : categoryCounts[key].toLocaleString()})
          </button>)}</div>
        </div>)}</div>
      </details>
    </div>
  </section>;
}

export const CompanyDirectoryFilters = memo(CompanyDirectoryFiltersView);
