import { Sidebar } from "@/components/layouts/Sidebar";
import { Header } from "@/components/layouts/Header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
