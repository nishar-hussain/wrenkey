"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, Settings, UsersRound, Tag, Shield, Activity, CreditCard, Webhook, Wallet, Wrench, Layers, Cloud, Plus, Minus,
  Menu, X, FileCode,
} from "lucide-react";

const mainNav = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/company-wallets", label: "Company Wallets", icon: Building2 },
];

const orgSettingsChildren = [
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/tags", label: "Tags", icon: Tag },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/contract-interfaces", label: "Contract Interfaces", icon: FileCode },
  { href: "/activity-logs", label: "Activity Log", icon: Activity },
  { href: "/billing", label: "Billing & Usage", icon: CreditCard },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
];

const embeddedChildren = [
  { href: "/configuration", label: "Configuration", icon: Wrench },
  { href: "/sub-orgs", label: "Sub-Orgs", icon: Layers },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated, user, org } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [embeddedOpen, setEmbeddedOpen] = useState(false);

  if (!isAuthenticated) return null;

  const NavItem = ({ href, label, icon: Icon, indent }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; indent?: boolean }) => {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link href={href} onClick={() => setTimeout(() => setMobileOpen(false), 100)}
        className={cn("flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors", indent && "ml-4",
          isActive ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium"
            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800")}>
        <Icon className="h-4 w-4 shrink-0" />{label}
      </Link>
    );
  };

  const SectionHeader = ({ label, icon: Icon, open, onClick }: { label: string; icon: React.ComponentType<{ className?: string }>; open: boolean; onClick: () => void }) => (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {open ? <Minus className="h-3.5 w-3.5 shrink-0 text-gray-400" /> : <Plus className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
    </button>
  );

  const sideNav = (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 shrink-0">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg" onClick={() => setMobileOpen(false)}>
          <Image src="/logo-icon.png" alt="WranKey" width={28} height={28} className="rounded-md" />WranKey
        </Link>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-0.5">
          {mainNav.map(item => <NavItem key={item.href} {...item} />)}

          <SectionHeader label="Organization Settings" icon={Settings} open={orgOpen} onClick={() => setOrgOpen(!orgOpen)} />
          {orgOpen && orgSettingsChildren.map(item => <NavItem key={item.href} {...item} indent />)}

          <SectionHeader label="Embedded Wallets" icon={Wallet} open={embeddedOpen} onClick={() => setEmbeddedOpen(!embeddedOpen)} />
          {embeddedOpen && embeddedChildren.map(item => <NavItem key={item.href} {...item} indent />)}

          <NavItem href="/verifiable-cloud" label="Verifiable Cloud" icon={Cloud} />
        </div>
      </div>

      <div className="border-t border-gray-200 p-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-medium shrink-0">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.email || "User"}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate capitalize">{user?.role?.replace("_", " ").toLowerCase() || "Member"}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{org?.name} · <span className="font-mono">{org?.id?.slice(0, 6)}</span></p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setMobileOpen(true)} className="lg:hidden fixed top-3 left-3 z-50 bg-white border border-gray-200 rounded-md p-2 shadow-sm"><Menu className="h-5 w-5 text-gray-700" /></button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col shrink-0">{sideNav}</aside>
      {mobileOpen && <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col shadow-xl">{sideNav}</aside>}
    </>
  );
}
