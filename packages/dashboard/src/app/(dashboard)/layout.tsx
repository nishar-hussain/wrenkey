import { Suspense } from "react";
import { Sidebar } from "@/components/layouts/Sidebar";
import { Header } from "@/components/layouts/Header";
import { AuthGuard } from "@/components/providers/AuthGuard";

function DashboardContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-white dark:bg-gray-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <Suspense fallback={<div className="flex h-screen items-center justify-center bg-white dark:bg-gray-950"><p className="text-slate-400">Loading...</p></div>}>
        <DashboardContent>{children}</DashboardContent>
      </Suspense>
    </AuthGuard>
  );
}
