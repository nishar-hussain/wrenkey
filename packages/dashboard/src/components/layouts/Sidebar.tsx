"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, Settings, UsersRound, Tag, Shield, Activity, CreditCard, Webhook, Wallet, Wrench, Layers, Cloud,
  Menu, X, FileCode, Send, Key, Bot, CheckCircle, Lock, DollarSign, ChevronDown,
} from "lucide-react";

const mainNav = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/wallets", label: "Wallets", icon: Wallet },
  { href: "/transactions", label: "Transactions", icon: Send },
  { href: "/company-wallets", label: "Company Wallets", icon: Building2 },
];

const walletChildren = [
  { href: "/spending-limits", label: "Spending Limits", icon: DollarSign },
  { href: "/private-keys", label: "Private Keys", icon: Lock },
  { href: "/approvals", label: "Approvals", icon: CheckCircle },
];

const developerChildren = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/api-keys", label: "API Keys", icon: Key },
  { href: "/contract-interfaces", label: "Contract Interfaces", icon: FileCode },
];

const orgSettingsChildren = [
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/tags", label: "Tags", icon: Tag },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/activity-logs", label: "Activity Log", icon: Activity },
  { href: "/sessions", label: "Sessions", icon: CheckCircle },
  { href: "/billing", label: "Billing", icon: CreditCard },
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
  const [walletOpen, setWalletOpen] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);

  if (!isAuthenticated) return null;

  const NavItem = ({ href, label, icon: Icon, indent }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; indent?: boolean }) => {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link href={href} onClick={() => setMobileOpen(false)}
        className={cn("flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors", indent && "ml-4",
          isActive ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-accent")}>
        <Icon className="h-4 w-4 shrink-0" />{label}
      </Link>
    );
  };

  const SectionHeader = ({ label, icon: Icon, open, onClick }: { label: string; icon: React.ComponentType<{ className?: string }>; open: boolean; onClick: () => void }) => (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
    </button>
  );

  const sideNav = (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center justify-between px-6 border-b border-border shrink-0">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg" onClick={() => setMobileOpen(false)}>
          <Image src="/logo-icon.png" alt="WranKey" width={28} height={28} className="rounded-md" />WranKey
        </Link>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-0.5">
          {mainNav.map(item => <NavItem key={item.href} {...item} />)}

          <SectionHeader label="Wallet & Security" icon={Lock} open={walletOpen} onClick={() => setWalletOpen(!walletOpen)} />
          {walletOpen && walletChildren.map(item => <NavItem key={item.href} {...item} indent />)}

          <SectionHeader label="Developer" icon={Bot} open={developerOpen} onClick={() => setDeveloperOpen(!developerOpen)} />
          {developerOpen && developerChildren.map(item => <NavItem key={item.href} {...item} indent />)}

          <SectionHeader label="Organization" icon={Settings} open={orgOpen} onClick={() => setOrgOpen(!orgOpen)} />
          {orgOpen && orgSettingsChildren.map(item => <NavItem key={item.href} {...item} indent />)}

          <SectionHeader label="Embedded Wallets" icon={Wallet} open={embeddedOpen} onClick={() => setEmbeddedOpen(!embeddedOpen)} />
          {embeddedOpen && embeddedChildren.map(item => <NavItem key={item.href} {...item} indent />)}

          <NavItem href="/verifiable-compute" label="Verifiable Compute" icon={Cloud} />
          <NavItem href="/verifiable-compute/operators" label="Operators" icon={Key} />
        </div>
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium shrink-0">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{user?.email || "User"}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{user?.role === "ORG_ADMIN" ? "Root User" : user?.role?.replace("_", " ").toLowerCase() || "Member"}</p>
            <p className="text-xs text-muted-foreground truncate">{org?.name}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setMobileOpen(true)} className="lg:hidden fixed top-3 left-3 z-50 bg-card border border-border rounded-md p-2 shadow-sm">
        <Menu className="h-5 w-5 text-foreground" />
      </button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />}
      <aside className="hidden lg:flex w-64 bg-card border-r border-border flex-col shrink-0">{sideNav}</aside>
      {mobileOpen && <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col shadow-xl animate-slide-up">{sideNav}</aside>}
    </>
  );
}
