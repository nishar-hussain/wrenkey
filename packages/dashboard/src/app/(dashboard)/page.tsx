"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/Providers";
import {
  ShieldCheck, ListChecks, Shield, Headphones, Radio,
  Coins, Code2, Terminal, ArrowRight
} from "lucide-react";

// Real SDK Brand SVG Icons
const ReactIcon = () => (
  <svg viewBox="-11.5 -10.23174 23 20.46348" className="w-3.5 h-3.5 fill-none stroke-[#61DAFB] shrink-0">
    <circle cx="0" cy="0" r="2.0" fill="#61DAFB" />
    <g strokeWidth="1">
      <ellipse rx="11" ry="4.2" />
      <ellipse rx="11" ry="4.2" transform="rotate(60)" />
      <ellipse rx="11" ry="4.2" transform="rotate(120)" />
    </g>
  </svg>
);

const ReactNativeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0">
    <rect x="5" y="2" width="14" height="20" rx="3" fill="none" className="stroke-gray-500 dark:stroke-gray-400" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="1.5" fill="#61DAFB" />
    <g stroke="#61DAFB" strokeWidth="1" fill="none" transform="translate(12, 12) scale(0.5)">
      <ellipse rx="11" ry="4.2" />
      <ellipse rx="11" ry="4.2" transform="rotate(60)" />
      <ellipse rx="11" ry="4.2" transform="rotate(120)" />
    </g>
  </svg>
);

const SwiftIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#F05138] shrink-0">
    <path d="M19.67 15.65c-2.48 2.37-6.22 3.66-9.67 2.35 4.38-.6 7.42-3.14 8.78-6.19-2.33 2.12-5.46 3.01-8.52 2.34 4.54-1.62 7.02-5.43 6.94-9.15-2.22 2.23-5.26 3.61-8.5 3.52C11.53 5.48 14.88 2.65 19 1.5 14.07 1.83 9.4 4.96 7.57 9.5c-.84 2.08-1.07 4.34-.67 6.55-3.32-3.7-3.95-9.14-1.58-13.55C2.15 6.06 1.34 11.23 3.32 15.75c1.98 4.52 6.3 7.58 11.23 7.75 4.79.16 9.32-2.17 12.01-6.15-2.07.69-4.5.33-6.89-1.7z"/>
  </svg>
);

const FlutterIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0">
    <path fill="#47C5FB" d="M14.3 2.5L5 11.8l3.5 3.5 12.8-12.8z" />
    <path fill="#47C5FB" d="M12.6 13.5L7.9 18.2l3.5 3.5 4.7-4.7z" />
    <path fill="#00569E" d="M11.4 17l4.7 4.7h7.1l-8.3-8.3z" />
    <path fill="#00B5F8" d="M16.1 21.7L12.6 18.2 16.1 14.7 19.6 18.2z" />
  </svg>
);

const KotlinIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0">
    <defs>
      <linearGradient id="ktGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E44857" />
        <stop offset="50%" stopColor="#C811E0" />
        <stop offset="100%" stopColor="#7F52FF" />
      </linearGradient>
    </defs>
    <path fill="url(#ktGrad)" d="M24 24H0V0h24L12 12z" />
  </svg>
);

const TypeScriptIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0">
    <rect width="24" height="24" rx="4" fill="#3178C6" />
    <path fill="#FFFFFF" d="M11.7 14.2h-2.1v6.8H7.3v-6.8H5.2V12.5h6.5v1.7zm6.7 3.3c0 .8-.3 1.4-.9 1.9-.6.5-1.4.7-2.4.7-1 0-1.8-.2-2.5-.7-.7-.5-1.1-1.1-1.3-1.9l1.8-.7c.1.5.3.8.7 1.1.4.3.8.4 1.3.4.5 0 .9-.1 1.2-.3.3-.2.4-.5.4-.8 0-.3-.1-.5-.4-.7-.3-.2-.8-.4-1.5-.6-1-.3-1.8-.6-2.3-1-.5-.4-.8-1-.8-1.8 0-.8.3-1.5.9-2 .6-.5 1.4-.8 2.4-.8.9 0 1.7.2 2.3.6.6.4 1 1 1.2 1.7l-1.8.7c-.1-.4-.3-.7-.6-.9-.3-.2-.7-.3-1.1-.3-.4 0-.8.1-1 .3-.3.2-.4.4-.4.7 0 .3.1.5.3.7.2.2.7.3 1.5.6 1.1.3 1.9.7 2.4 1.1.4.4.7 1 .7 1.8z"/>
  </svg>
);

const GoIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-3.5 shrink-0">
    <path fill="#00ADD8" d="M1.8 10.4c.1-.4.2-.8.5-1.2l2.3-3.9C5.2 4.3 6.4 3.5 7.8 3.5c1.8 0 3.1 1.3 3.3 3.1h-2.1c-.2-.7-.7-1.2-1.3-1.2-.7 0-1.3.4-1.6 1.1L4.2 10c-.3.6-.4 1.2-.3 1.9.2 1.3 1.3 2.3 2.7 2.3 1.2 0 2.2-.8 2.6-1.9H6.8V10.5H11.5v.8c-.3 1.8-1.3 3.3-2.9 4.1-1.7.8-3.7.6-5.2-.4-1.3-.9-2-2.4-1.6-4.6zm13.1.1c.1-.5.3-1 .6-1.4l2.1-3.6c.7-1.1 1.9-1.8 3.2-1.8 2.1 0 3.8 1.6 3.8 3.8 0 1.2-.5 2.3-1.4 3.1l-2.1 3.6c-.7 1.1-1.9 1.8-3.2 1.8-2.1 0-3.8-1.6-3.8-3.8 0-.6.3-1.2.8-1.8zm3.2 3.6c.6 0 1.1-.3 1.4-.8l2.1-3.6c.3-.5.4-1 .4-1.5 0-1-.8-1.8-1.8-1.8-.6 0-1.1.3-1.4.8l-2.1 3.6c-.3.5-.4 1-.4 1.5 0 1 .8 1.8 1.8 1.8z" />
  </svg>
);

const PythonIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0">
    <path fill="#3776AB" d="M11.87 2c-4.48 0-4.2 1.94-4.2 1.94v2.01h4.28v.61H5.97s-2.97-.34-2.97 4.14 2.59 4.28 2.59 4.28h1.55v-2.19s-.08-2.59 2.56-2.59h4.25s2.44.04 2.44-2.37V4.28s.37-2.28-4.52-2.28zm-2.3 1.34a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z"/>
    <path fill="#FFD43B" d="M12.13 22c4.48 0 4.2-1.94 4.2-1.94v-2.01h-4.28v-.61h5.98s2.97.34 2.97-4.14-2.59-4.28-2.59-4.28h-1.55v2.19s.08 2.59-2.56 2.59h-4.25s-2.44-.04-2.44 2.37v3.74s-.37 2.28 4.52 2.28zm2.3-1.34a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6z"/>
  </svg>
);

const RubyIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#CC342D] shrink-0">
    <path d="M18.8 9.5l-6.8 12.3L2 14.2l3.4-9.3L15.3 2l3.5 7.5zM7.2 4.9L3.9 13.5l8.7 6.4 5.3-9.5-2.7-5.5H7.2z"/>
  </svg>
);

const RustIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current text-gray-800 dark:text-gray-200 shrink-0">
    <path d="M12 2a10 10 0 0 0-3.16.52l-.63-1.09-1.73 1 .63 1.08A10 10 0 0 0 4.3 5.46L3.05 4.74l-1 1.73 1.25.72A10 10 0 0 0 2.05 10H.6v2h1.45a10 10 0 0 0 1.25 2.81l-1.25.72 1 1.73 1.25-.72a10 10 0 0 0 2.81 1.95l-.63 1.08 1.73 1 .63-1.09A10 10 0 0 0 12 22a10 10 0 0 0 3.16-.52l.63 1.09 1.73-1-.63-1.08a10 10 0 0 0 2.81-1.95l1.25.72 1-1.73-1.25-.72A10 10 0 0 0 21.95 12h1.45v-2h-1.45a10 10 0 0 0-1.25-2.81l1.25-.72-1-1.73-1.25.72A10 10 0 0 0 16.89 3.5l.63-1.08-1.73-1-.63 1.09A10 10 0 0 0 12 2zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-3 4v6h2v-2h1l1.5 2h2.5l-2-2.5c.8-.4 1.5-1.2 1.5-2.3 0-1.5-1.2-2.2-3-2.2H9zm2 1.5h1.2c.6 0 1 .2 1 .7s-.4.8-1 .8H11v-1.5z"/>
  </svg>
);

const FoundryIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#FF4500] shrink-0">
    <path d="M4 18h16v2H4zm.6-4.2l2.8-2.8L12 15.6l4.6-4.6 2.8 2.8-7.4 7.4zM12 4l3.5 3.5L12 11 8.5 7.5z"/>
  </svg>
);

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 py-2">
      {/* Top Title */}
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Welcome
        </h1>
      </div>

      {/* Featured Cards (2-Column Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Embedded Wallets */}
        <div className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 rounded-2xl p-7 relative overflow-hidden flex flex-col justify-between shadow-sm min-h-[300px] group hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start relative z-10">
            <div className="sm:col-span-8 space-y-3">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Embedded Wallets
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Wallets embedded directly into your app experience.
              </p>
              <div className="pt-2">
                <Link
                  href="/configuration"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100/90 dark:bg-gray-800 hover:bg-gray-200/80 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Quickstart</span>
                </Link>
              </div>
            </div>

            {/* Right Side 3D Artwork Graphic with Grid Background */}
            <div className="sm:col-span-4 flex items-center justify-center relative min-h-[140px]">
              {/* Background grid */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:14px_14px] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] opacity-70 rounded-xl" />
              
              {/* 3D Metallic Wallet Icon Badge */}
              <div className="relative z-10 w-24 h-24 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                <svg viewBox="0 0 100 100" fill="none" className="w-full h-full drop-shadow-[0_12px_20px_rgba(147,51,234,0.4)]">
                  <defs>
                    <linearGradient id="purpleGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#C084FC" />
                      <stop offset="50%" stopColor="#9333EA" />
                      <stop offset="100%" stopColor="#581C87" />
                    </linearGradient>
                    <linearGradient id="innerGlass" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3B0764" />
                      <stop offset="100%" stopColor="#1E1B4B" />
                    </linearGradient>
                  </defs>
                  {/* Outer 3D Bevel Plate */}
                  <rect x="10" y="10" width="80" height="80" rx="22" fill="url(#purpleGrad1)" stroke="#E9D5FF" strokeWidth="2.5" />
                  {/* Inner Screen */}
                  <rect x="22" y="22" width="56" height="56" rx="14" fill="url(#innerGlass)" stroke="#A855F7" strokeWidth="1.5" />
                  {/* Terminal / Wallet Prompt Graphics */}
                  <path d="M34 42L44 50L34 58" stroke="#E9D5FF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="48" y1="58" x2="62" y2="58" stroke="#E9D5FF" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom SDK list */}
          <div className="pt-6 border-t border-gray-100 dark:border-gray-800/80 mt-6">
            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
              SDKs:
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <ReactIcon /> React
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <ReactNativeIcon /> React Native
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <SwiftIcon /> Swift
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <FlutterIcon /> Flutter
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <KotlinIcon /> Kotlin
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <TypeScriptIcon /> TypeScript | Frontend
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <TypeScriptIcon /> TypeScript | Server
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Company Wallets */}
        <div className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 rounded-2xl p-7 relative overflow-hidden flex flex-col justify-between shadow-sm min-h-[300px] group hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start relative z-10">
            <div className="sm:col-span-8 space-y-3">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Company Wallets
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Programmatic wallets for treasury and operations.
              </p>
              <div className="pt-2">
                <Link
                  href="/company-wallets"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100/90 dark:bg-gray-800 hover:bg-gray-200/80 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Quickstart</span>
                </Link>
              </div>
            </div>

            {/* Right Side 3D Artwork Graphic with Grid Background */}
            <div className="sm:col-span-4 flex items-center justify-center relative min-h-[140px]">
              {/* Background grid */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:14px_14px] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] opacity-70 rounded-xl" />

              {/* 3D Metallic Diamond Logo Badge */}
              <div className="relative z-10 w-24 h-24 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                <svg viewBox="0 0 100 100" fill="none" className="w-full h-full drop-shadow-[0_12px_20px_rgba(147,51,234,0.4)]">
                  <defs>
                    <linearGradient id="diamondGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#E9D5FF" />
                      <stop offset="40%" stopColor="#A855F7" />
                      <stop offset="100%" stopColor="#3B0764" />
                    </linearGradient>
                    <linearGradient id="diamondInner" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#2E1065" />
                      <stop offset="100%" stopColor="#0F172A" />
                    </linearGradient>
                  </defs>
                  {/* Outer Rotated 3D Diamond Plate */}
                  <g transform="rotate(45 50 50)">
                    <rect x="15" y="15" width="70" height="70" rx="18" fill="url(#diamondGrad)" stroke="#F3E8FF" strokeWidth="2.5" />
                    <rect x="25" y="25" width="50" height="50" rx="12" fill="url(#diamondInner)" stroke="#C084FC" strokeWidth="1.5" />
                  </g>
                  {/* Key Slot Line in Middle */}
                  <rect x="36" y="47" width="28" height="6" rx="3" fill="#E9D5FF" />
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom SDK list */}
          <div className="pt-6 border-t border-gray-100 dark:border-gray-800/80 mt-6">
            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
              SDKs:
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <TypeScriptIcon /> TypeScript | Server
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <GoIcon /> Go
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <PythonIcon /> Python
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <RubyIcon /> Ruby
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <RustIcon /> Rust
              </span>
              <span className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 px-2.5 py-1 rounded-md">
                <FoundryIcon /> Foundry
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Foundations Section */}
      <div className="pt-2">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
          Foundations
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Link
            href="/policies"
            className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all text-gray-800 dark:text-gray-200 font-medium text-sm group"
          >
            <ShieldCheck className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            <span>Security overview</span>
          </Link>

          <Link
            href="/configuration"
            className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all text-gray-800 dark:text-gray-200 font-medium text-sm group"
          >
            <ListChecks className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            <span>Production checklist</span>
          </Link>

          <Link
            href="/policies"
            className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all text-gray-800 dark:text-gray-200 font-medium text-sm group"
          >
            <Shield className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            <span>Policies</span>
          </Link>

          <Link
            href="/support"
            className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all text-gray-800 dark:text-gray-200 font-medium text-sm group"
          >
            <Headphones className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            <span>Support</span>
          </Link>

          <Link
            href="/transactions"
            className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all text-gray-800 dark:text-gray-200 font-medium text-sm group"
          >
            <Radio className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            <span>Broadcasting</span>
          </Link>

          <Link
            href="/company-wallets"
            className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all text-gray-800 dark:text-gray-200 font-medium text-sm group"
          >
            <Coins className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            <span>Balances</span>
          </Link>

          <Link
            href="/docs"
            className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all text-gray-800 dark:text-gray-200 font-medium text-sm group"
          >
            <Code2 className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            <span>SDK reference</span>
          </Link>

          <Link
            href="/api-keys"
            className="bg-white dark:bg-[#0D111C] border border-gray-200/90 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all text-gray-800 dark:text-gray-200 font-medium text-sm group"
          >
            <Terminal className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            <span>API reference</span>
          </Link>
        </div>
      </div>
    </div>
  );
}


