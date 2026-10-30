import { ChevronLeft, ChevronRight } from "lucide-react";
import { memo } from "react";

type Props = { currentPage: number; pageCount: number; onPageChange: (page: number) => void };

function CompanyDirectoryPaginationView({ currentPage, pageCount, onPageChange }: Props) {
  if (pageCount <= 1) return null;
  const goToPage = (page: number) => {
    onPageChange(page);
    document.getElementById("company-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <nav aria-label="Company results pages" className="mb-10 flex flex-wrap items-center justify-center gap-2">
    <button type="button" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">
      <ChevronLeft size={16} />Previous
    </button>
    <span className="px-2 text-sm text-zinc-400">Page {currentPage} of {pageCount}</span>
    <button type="button" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">
      Next<ChevronRight size={16} />
    </button>
  </nav>;
}

export const CompanyDirectoryPagination = memo(CompanyDirectoryPaginationView);
