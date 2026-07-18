import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-success/15 text-success dark:text-success-foreground",
    PENDING: "bg-warning/15 text-warning dark:text-warning-foreground",
    SIGNED: "bg-primary/15 text-primary",
    BROADCAST: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    CONFIRMED: "bg-success/15 text-success dark:text-success-foreground",
    FAILED: "bg-destructive/15 text-destructive",
    REVOKED: "bg-destructive/15 text-destructive",
    DELETED: "bg-muted text-muted-foreground",
    FROZEN: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    ROTATED: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    IMPORTED: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
    CANCELLED: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    REPLACED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    RETRY: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    PENDING_MANIFEST: "bg-warning/15 text-warning",
    APPROVED: "bg-success/15 text-success dark:text-success-foreground",
    REJECTED: "bg-destructive/15 text-destructive",
    PROVISIONING: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    LIVE: "bg-success/15 text-success dark:text-success-foreground",
    INACTIVE: "bg-muted text-muted-foreground",
    MARKED_FOR_DELETION: "bg-destructive/15 text-destructive",
    AWAITING_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    WALLET_EXPORT: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    WALLET_FREEZE: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    WALLET_UNFREEZE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    WALLET_ROTATE: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    TRANSACTION: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    pending_manifest: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    provisioning: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    live: "bg-success/15 text-success",
    inactive: "bg-muted text-muted-foreground",
    marked_for_deletion: "bg-destructive/15 text-destructive",
    active: "bg-success/15 text-success",
    revoked: "bg-destructive/15 text-destructive",
    completed: "bg-success/15 text-success",
    failed: "bg-destructive/15 text-destructive",
    true: "bg-success/15 text-success",
    false: "bg-muted text-muted-foreground",
  };

  const style = styles[status] || "bg-muted text-muted-foreground";

  return (
    <span className={cn("inline-flex px-2 py-0.5 text-xs font-medium rounded-full", style)}>
      {String(status)}
    </span>
  );
}
