"use client";

import { useAuth } from "@/components/providers/Providers";
import { useRouter } from "next/navigation";

export function Header() {
  const { isAuthenticated, user, org, logout } = useAuth();
  const router = useRouter();

  if (!isAuthenticated) return null;

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
      <div>
        <h2 className="text-sm font-medium text-slate-600">{org?.name || "Organization"}</h2>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-500">
          {user?.email || "User"}
          <span className="ml-2 text-xs bg-slate-100 px-2 py-0.5 rounded">{user?.role}</span>
        </span>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
