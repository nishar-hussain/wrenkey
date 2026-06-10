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

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
      <span className="text-sm text-slate-500">
        Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(limit, Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="px-3 py-1 text-sm rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
        >
          Prev
        </button>
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => onPageChange(limit, i * limit)}
            className={`px-3 py-1 text-sm rounded border ${
              currentPage === i + 1
                ? "bg-brand-600 text-white border-brand-600"
                : "border-slate-300 hover:bg-slate-50"
            }`}
          >
            {i + 1}
          </button>
        ))}
        <button
          onClick={() => onPageChange(limit, offset + limit)}
          disabled={offset + limit >= total}
          className="px-3 py-1 text-sm rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
