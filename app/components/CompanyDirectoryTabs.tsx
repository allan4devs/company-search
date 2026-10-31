import { memo, type Dispatch, type SetStateAction } from "react";
import { COMPANY_GROUPS, type CompanyDirectoryCategory, type CompanyDirectoryMainFilter } from "../company-directory.constants";

type Props = {
  tab: CompanyDirectoryMainFilter;
  setTab: Dispatch<SetStateAction<CompanyDirectoryMainFilter>>;
  groupCounts: Partial<Record<CompanyDirectoryMainFilter, number>>;
};

const savedViewTabs: { key: CompanyDirectoryCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "likes", label: "Likes" },
  { key: "dislikes", label: "Dislikes" },
];
const tabs: { key: CompanyDirectoryMainFilter; label: string }[] = [
  ...savedViewTabs,
  ...COMPANY_GROUPS.map(({ key, title }) => ({ key, label: title })),
];

function CompanyDirectoryTabsView({ tab, setTab, groupCounts = {} }: Props) {
  return <div className="mb-6 border-b border-zinc-800 pb-4">
    <div role="tablist" aria-label="Company views" className="flex flex-wrap gap-2">
      {tabs.map(({ key, label }) => <button
        key={key}
        type="button"
        role="tab"
        id={`${key}-tab`}
        aria-selected={tab === key}
        aria-controls="company-panel"
        onClick={() => setTab(key)}
        className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-teal-400 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
      >
        {label}<span className={`ml-2 text-xs ${tab === key ? "text-zinc-800" : "text-zinc-500"}`}>{groupCounts[key]?.toLocaleString() ?? "…"}</span>
      </button>)}
    </div>
  </div>;
}

export const CompanyDirectoryTabs = memo(CompanyDirectoryTabsView);
