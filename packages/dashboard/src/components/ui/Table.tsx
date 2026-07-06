import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: string;
  loading?: boolean;
  emptyMessage?: string;
}

export function Table<T>({
  columns,
  data,
  keyField = "id",
  loading,
  emptyMessage = "No data found",
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="w-full">
        <div className="border-b">
          <div className="flex">
            {columns.map((col) => (
              <th key={col.key} className={cn("h-12 px-4 text-left align-middle font-medium text-muted-foreground", col.className)}>
                {col.header}
              </th>
            ))}
          </div>
        </div>
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex border-b">
              {columns.map((col) => (
                <div key={col.key} className={cn("p-4 align-middle", col.className)}>
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b transition-colors">
            {columns.map((col) => (
              <th key={col.key} className={cn("h-12 px-4 text-left align-middle font-medium text-muted-foreground", col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {data.map((item) => (
            <tr key={String((item as any)[keyField])} className="border-b transition-colors hover:bg-muted/50">
              {columns.map((col) => (
                <td key={col.key} className={cn("p-4 align-middle", col.className)}>
                  {col.render ? col.render(item) : String((item as any)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
