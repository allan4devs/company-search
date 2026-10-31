import { ChevronLeft, ChevronRight } from "lucide-react";
import { memo } from "react";

type Props = {
  currentPage: number;
  pageCount: number;
  ariaLabel?: string;
  onPageChange: (page: number) => void;
};

function CompanyDirectoryPaginationView({
  currentPage,
  pageCount,
  ariaLabel = "Company results pages",
  onPageChange,
}: Props) {
  if (pageCount <= 1) return null;
  const quickPages = [1, 2, 3, 8, 24].filter(
    (page) => page <= pageCount,
  );
  const goToPage = (page: number) => {
    onPageChange(page);
    document
      .getElementById("company-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-0 z-20 mx-auto mb-4 flex w-full max-w-2xl flex-wrap items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-3 shadow-lg shadow-black/20 backdrop-blur"
    >
      <button
        type="button"
        disabled={currentPage === 1}
        onClick={() => goToPage(currentPage - 1)}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft size={16} />
        Previous
      </button>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {quickPages.map((page) => (
          <button
            key={page}
            type="button"
            aria-label={`Go to page ${page}`}
            aria-current={currentPage === page ? "page" : undefined}
            onClick={() => goToPage(page)}
            className={`min-h-10 min-w-10 rounded-lg border px-3 text-sm ${
              currentPage === page
                ? "border-teal-300 bg-teal-300 text-zinc-950"
                : "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            {page}
          </button>
        ))}
      </div>
      <span className="px-2 text-sm text-zinc-400">
        Page {currentPage} of {pageCount}
      </span>
      <button
        type="button"
        disabled={currentPage === pageCount}
        onClick={() => goToPage(currentPage + 1)}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

export const CompanyDirectoryPagination = memo(CompanyDirectoryPaginationView);
