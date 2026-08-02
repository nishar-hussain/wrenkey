"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { cn } from "@/lib/utils";
import {
  Home, Building2, UsersRound, Tag, Shield, Activity, CreditCard, Webhook,
  Wrench, Layers, Cloud, Menu, X, ChevronLeft, Minus, Plus
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated, user, org } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(true);
  const [embeddedOpen, setEmbeddedOpen] = useState(true);

  if (!isAuthenticated) return null;

  const NavItem = ({ href, label, icon: Icon, indent }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; indent?: boolean }) => {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
          indent && "ml-3 text-[13px]",
          isActive
            ? "bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800/60"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-[#4F46E5] dark:text-indigo-300" : "text-gray-400 dark:text-gray-500")} />
        <span>{label}</span>
      </Link>
    );
  };

  const SectionHeader = ({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 mt-3 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
    >
      <span>{label}</span>
      <span className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-medium">
        {open ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </span>
    </button>
  );

  const sideNav = (
    <div className="flex flex-col h-full bg-card">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 shrink-0">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight text-foreground" onClick={() => setMobileOpen(false)}>
          <Image src="/logo-icon.png" alt="WranKey" width={28} height={28} className="rounded-lg" />
          <span className="font-semibold text-lg text-foreground tracking-tight">WranKey</span>
        </Link>
        <div className="flex items-center gap-1">
          <button className="hidden lg:flex items-center justify-center p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Nav Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <NavItem href="/" label="Home" icon={Home} />

        <SectionHeader label="Organization Settings" open={orgOpen} onClick={() => setOrgOpen(!orgOpen)} />
        {orgOpen && (
          <div className="space-y-0.5">
            <NavItem href="/team" label="Team" icon={UsersRound} indent />
            <NavItem href="/tags" label="Tags" icon={Tag} indent />
            <NavItem href="/policies" label="Policies" icon={Shield} indent />
            <NavItem href="/activity-logs" label="Activity Log" icon={Activity} indent />
            <NavItem href="/billing" label="Billing & Usage" icon={CreditCard} indent />
            <NavItem href="/webhooks" label="Webhooks" icon={Webhook} indent />
          </div>
        )}

        <div className="pt-2">
          <NavItem href="/company-wallets" label="Company Wallets" icon={Building2} />
        </div>

        <SectionHeader label="Embedded Wallets" open={embeddedOpen} onClick={() => setEmbeddedOpen(!embeddedOpen)} />
        {embeddedOpen && (
          <div className="space-y-0.5">
            <NavItem href="/configuration" label="Configuration" icon={Wrench} indent />
            <NavItem href="/sub-orgs" label="Sub-Orgs" icon={Layers} indent />
          </div>
        )}

        <div className="pt-2">
          <NavItem href="/verifiable-cloud" label="Verifiable Cloud" icon={Cloud} />
        </div>
      </div>

      {/* Sticky Bottom Footer */}
      <div className="border-t border-border px-5 py-4 flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
        <Link href="/docs" className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
          Docs
        </Link>
        <Link href="/support" className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
          Support
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setMobileOpen(true)} className="lg:hidden fixed top-3 left-3 z-50 bg-card border border-border rounded-md p-2 shadow-sm">
        <Menu className="h-5 w-5 text-foreground" />
      </button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />}
      <aside className="hidden lg:flex w-60 bg-card border-r border-border flex-col shrink-0">{sideNav}</aside>
      {mobileOpen && <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col shadow-xl animate-slide-up">{sideNav}</aside>}
    </>
  );
}

