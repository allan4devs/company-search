import { memo } from "react";

type Props = { companyCount: number; targetCount: number; midLevelCount: number; nearshoreCount: number };

function CompanyDirectoryStatsView({ companyCount, targetCount, midLevelCount, nearshoreCount }: Props) {
  return <div className="mb-6 grid gap-4 rounded-2xl border border-teal-900 bg-teal-950/20 p-5 sm:grid-cols-3">
    <div>
      <p className="text-sm font-semibold text-teal-200">{companyCount.toLocaleString()} / {targetCount.toLocaleString()} companies</p>
      <progress aria-label="Company collection goal" value={companyCount} max={targetCount} className="mt-3 h-2 w-full accent-teal-400" />
    </div>
    <div>
      <p className="text-sm text-teal-200">{midLevelCount} companies with mid-level signals</p>
      <p className="mt-2 text-xs text-zinc-400">Match titles and source evidence, then check the current opening.</p>
    </div>
    <div>
      <p className="text-sm text-teal-200">{nearshoreCount} nearshore companies</p>
      <p className="mt-2 text-xs text-zinc-400">Your saved likes, dislikes, and careers links stay with each company.</p>
    </div>
  </div>;
}

export const CompanyDirectoryStats = memo(CompanyDirectoryStatsView);
