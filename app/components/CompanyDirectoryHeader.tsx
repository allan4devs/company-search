import { memo } from "react";

type Props = { companyCount: number; homepageCount: number };

function CompanyDirectoryHeaderView({ companyCount, homepageCount }: Props) {
  return <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">Explore the companies</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Company directory</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">
          Your independent company workspace. Explore {companyCount.toLocaleString()} companies for full-stack, backend, and frontend work. Focus on Java, React, Python, and Node.js, with mid-level signals where available.
        </p>
      </div>
      <p className="text-sm text-zinc-500">{companyCount} companies <span aria-hidden="true">/</span> {homepageCount} homepages</p>
  </header>;
}

export const CompanyDirectoryHeader = memo(CompanyDirectoryHeaderView);

function CompanyDirectoryTopbarView() {
  return <nav aria-label="Company navigation" className="border-b border-zinc-800 px-4 py-4 sm:px-8">
    <span className="text-sm font-bold tracking-widest text-teal-300">COMP / Company workspace</span>
  </nav>;
}

export const CompanyDirectoryTopbar = memo(CompanyDirectoryTopbarView);
