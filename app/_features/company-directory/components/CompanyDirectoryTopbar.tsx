import { memo } from "react";

function CompanyDirectoryTopbarView() {
  return (
    <nav
      aria-label="Company navigation"
      className="border-b border-zinc-800 px-4 py-4 sm:px-8"
    >
      <span className="text-sm font-bold tracking-widest text-teal-300">
        COMP / Company workspace
      </span>
    </nav>
  );
}

export const CompanyDirectoryTopbar = memo(CompanyDirectoryTopbarView);
