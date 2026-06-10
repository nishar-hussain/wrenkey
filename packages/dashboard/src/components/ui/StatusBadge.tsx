export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    SIGNED: "bg-blue-100 text-blue-700",
    BROADCAST: "bg-purple-100 text-purple-700",
    CONFIRMED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
    REVOKED: "bg-red-100 text-red-700",
    DELETED: "bg-slate-100 text-slate-700",
    true: "bg-green-100 text-green-700",
    false: "bg-slate-100 text-slate-700",
  };

  const color = colors[status] || "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>
      {String(status)}
    </span>
  );
}
