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
  const pageNumbers = [
    ...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount]),
  ]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((a, b) => a - b);
  const pageItems: (
    | { type: "page"; page: number }
    | { type: "ellipsis"; key: string }
  )[] = [];
  pageNumbers.forEach((page, index) => {
    const previous = pageNumbers[index - 1];
    if (previous !== undefined) {
      const gap = page - previous;
      if (gap === 2) pageItems.push({ type: "page", page: previous + 1 });
      else if (gap > 2)
        pageItems.push({ type: "ellipsis", key: `${previous}-${page}` });
    }
    pageItems.push({ type: "page", page });
  });
  const controlClass = "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-teal-300 disabled:pointer-events-none disabled:opacity-25 sm:size-11";

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-2 z-20 mx-auto mb-4 flex w-fit max-w-full items-center justify-center gap-1 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-1 shadow-lg backdrop-blur"
    >
      <button
        type="button"
        aria-label="Previous page"
        disabled={currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
        className={controlClass}
      >
        <ChevronLeft size={16} />
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Page {currentPage} of {pageCount}
      </span>
      {pageItems.map((item) =>
        item.type === "ellipsis" ? (
          <span
            key={`ellipsis-${item.key}`}
            aria-hidden="true"
            className="w-4 text-center text-sm text-zinc-500"
          >
            …
          </span>
        ) : (
          <button
            key={item.page}
            type="button"
            aria-label={`Page ${item.page}`}
            aria-current={item.page === currentPage ? "page" : undefined}
            onClick={() => goToPage(item.page)}
            className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition focus-visible:outline-2 focus-visible:outline-teal-300 sm:size-11 ${item.page === currentPage ? "border-teal-300 bg-teal-300 text-zinc-950" : "border-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}
          >
            {item.page}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label="Next page"
        disabled={currentPage >= pageCount}
        onClick={() => goToPage(currentPage + 1)}
        className={controlClass}
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

export const CompanyDirectoryPagination = memo(CompanyDirectoryPaginationView);
