import { cn } from "@/lib/utils";

interface PaginationProps {
  limit: number;
  offset: number;
  total: number;
  onPageChange: (limit: number, offset: number) => void;
}

export function Pagination({ limit, offset, total, onPageChange }: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  if (totalPages <= 1) return null;

  // Build page numbers with ellipsis for large page counts
  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | string)[] = [1];
    if (currentPage > 3) pages.push("…");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("…");
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="text-sm text-muted-foreground">
        Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(limit, Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="px-3 py-1 text-sm rounded-md border border-border text-muted-foreground disabled:opacity-40 hover:bg-accent hover:text-foreground transition-colors"
        >
          Prev
        </button>
        {getPageNumbers().map((page, i) =>
          typeof page === "number" ? (
            <button
              key={i}
              onClick={() => onPageChange(limit, (page - 1) * limit)}
              className={cn(
                "px-3 py-1 text-sm rounded-md border transition-colors",
                currentPage === page
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {page}
            </button>
          ) : (
            <span key={i} className="px-2 py-1 text-sm text-muted-foreground">{page}</span>
          )
        )}
        <button
          onClick={() => onPageChange(limit, offset + limit)}
          disabled={offset + limit >= total}
          className="px-3 py-1 text-sm rounded-md border border-border text-muted-foreground disabled:opacity-40 hover:bg-accent hover:text-foreground transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
