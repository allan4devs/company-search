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
  const goToPage = (page: number) => {
    onPageChange(page);
    document
      .getElementById("company-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const buttonClass = "inline-flex size-9 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-teal-300 disabled:pointer-events-none disabled:opacity-25";

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-2 z-20 mx-auto mb-4 flex w-fit items-center justify-center gap-2 rounded-full bg-zinc-950/90 px-1 backdrop-blur"
    >
      <button
        type="button"
        aria-label="Previous page"
        disabled={currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
        className={buttonClass}
      >
        <ChevronLeft size={16} />
      </button>
      <span aria-live="polite" aria-atomic="true" className="min-w-12 text-center text-xs tabular-nums text-zinc-500">
        <span className="sr-only">Page </span>
        <span className="text-zinc-300">{currentPage}</span>
        <span aria-hidden="true"> / </span>
        <span className="sr-only"> of </span>
        {pageCount}
      </span>
      <button
        type="button"
        aria-label="Next page"
        disabled={currentPage >= pageCount}
        onClick={() => goToPage(currentPage + 1)}
        className={buttonClass}
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

export const CompanyDirectoryPagination = memo(CompanyDirectoryPaginationView);
