import { Suspense } from "react";
import { Sidebar } from "@/components/layouts/Sidebar";
import { Header } from "@/components/layouts/Header";
import { AuthGuard } from "@/components/providers/AuthGuard";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="space-y-4 w-full max-w-md px-6">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      }>
        <DashboardContent>{children}</DashboardContent>
      </Suspense>
    </AuthGuard>
  );
}
