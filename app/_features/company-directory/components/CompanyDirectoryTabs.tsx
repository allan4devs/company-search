import { memo, type Dispatch, type SetStateAction } from "react";
import type {
  CompanyDirectoryCategory,
  CompanyDirectoryMainFilter,
} from "../constants/directory";

type Props = {
  tab: CompanyDirectoryMainFilter;
  setTab: Dispatch<SetStateAction<CompanyDirectoryMainFilter>>;
  groupCounts: Partial<Record<CompanyDirectoryMainFilter, number>>;
  keywordQuery: string;
  setKeywordQuery: (value: string) => void;
  latamCostaRicaFilter: boolean;
  setLatamCostaRicaFilter: (value: boolean) => void;
  hideWithoutDomain: boolean;
  setHideWithoutDomain: (value: boolean) => void;
  country: string;
  setCountry: (value: string) => void;
  countryOptions: string[];
};

const savedViewTabs: { key: CompanyDirectoryCategory; label: string }[] = [
  { key: "all", label: "Total" },
  { key: "new", label: "New" },
  { key: "usa", label: "USA" },
  { key: "likes", label: "Likes" },
  { key: "dislikes", label: "Dislikes" },
  { key: "archived", label: "Archived" },
  { key: "saved-jobs", label: "Jobs" },
  { key: "applied-jobs", label: "Applied" },
  { key: "archived-jobs", label: "Archived jobs" },
];
const tabs: { key: CompanyDirectoryMainFilter; label: string }[] = savedViewTabs;
const jobFilters: CompanyDirectoryMainFilter[] = ["saved-jobs", "applied-jobs", "archived-jobs"];

function CompanyDirectoryTabsView({
  tab,
  setTab,
  groupCounts = {},
  keywordQuery,
  setKeywordQuery,
  latamCostaRicaFilter,
  setLatamCostaRicaFilter,
  hideWithoutDomain,
  setHideWithoutDomain,
  country,
  setCountry,
  countryOptions,
}: Props) {
  const selectTab = (key: CompanyDirectoryMainFilter) => {
    setTab(key);
  };
  return (
    <div className="mb-6 border-b border-zinc-800 pb-4">
      <label
        htmlFor="company-keyword-search"
        className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
      >
        {jobFilters.includes(tab) ? "Search jobs" : "Search keywords"}
      </label>
      <input
        id="company-keyword-search"
        type="search"
        value={keywordQuery}
        onChange={(event) => setKeywordQuery(event.target.value)}
        placeholder={jobFilters.includes(tab) ? "Job title, company, location…" : "Company, region, technology…"}
        className="mb-5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-teal-400 focus:outline-none"
      />
      {!jobFilters.includes(tab) ? (
        <>
          <button
            type="button"
            onClick={() => setLatamCostaRicaFilter(!latamCostaRicaFilter)}
            aria-pressed={latamCostaRicaFilter}
            className={`mb-5 w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold ${latamCostaRicaFilter ? "border-teal-400 bg-teal-400/10 text-teal-200" : "border-zinc-700 text-zinc-300 hover:border-teal-400"}`}
          >
            LATAM · Costa Rica details filter
          </button>
          <label className="mb-4 flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <input
              type="checkbox"
              checked={hideWithoutDomain}
              onChange={(event) => setHideWithoutDomain(event.target.checked)}
              className="h-4 w-4 accent-teal-400"
            />
            Hide companies without a domain
          </label>
          <label
            htmlFor="company-country-filter"
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
          >
            Company country
          </label>
          <select
            id="company-country-filter"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="mb-5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-teal-400 focus:outline-none"
          >
            <option value="all">All countries</option>
            {countryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <div
        role="tablist"
        aria-label="Directory views"
        aria-orientation="vertical"
        className="flex flex-col gap-2"
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${key}-tab`}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            onKeyDown={(event) => {
              const index = tabs.findIndex((item) => item.key === key);
              const next =
                event.key === "ArrowDown"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowUp"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              selectTab(tabs[next].key);
              document.getElementById(`${tabs[next].key}-tab`)?.focus();
            }}
            aria-controls="company-panel"
            onClick={() => selectTab(key)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${tab === key ? "bg-teal-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
          >
            {label}
            <span
              className={`ml-2 text-xs ${tab === key ? "text-zinc-800" : "text-zinc-500"}`}
            >
              {groupCounts[key]?.toLocaleString() ?? "…"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export const CompanyDirectoryTabs = memo(CompanyDirectoryTabsView);
