import { memo } from "react";
import Link from "next/link";

function CompanyDirectoryTopbarView({ jobsOnly = false }: { jobsOnly?: boolean }) {
  return (
    <nav
      aria-label="Workspace navigation"
      className="border-b border-zinc-800 px-4 py-4 sm:px-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-bold tracking-widest text-teal-300">
          COMP / {jobsOnly ? "Saved jobs" : "Company workspace"}
        </span>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link href="/" aria-current={!jobsOnly ? "page" : undefined} className={`rounded-lg px-3 py-2 ${jobsOnly ? "text-zinc-300 hover:bg-zinc-800" : "bg-zinc-800 text-teal-200"}`}>Companies</Link>
          <Link href="/saved-jobs" aria-current={jobsOnly ? "page" : undefined} className={`rounded-lg px-3 py-2 ${jobsOnly ? "bg-zinc-800 text-teal-200" : "text-zinc-300 hover:bg-zinc-800"}`}>Jobs</Link>
        </div>
      </div>
    </nav>
  );
}

export const CompanyDirectoryTopbar = memo(CompanyDirectoryTopbarView);
