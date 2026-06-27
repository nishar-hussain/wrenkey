"use client";

import React from "react";

export function Header() {
  return (
    <header className="fixed top-0 left-0 w-full z-40 bg-white/70 backdrop-blur-md border-b border-black/[0.06] transition-all duration-300">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center space-x-2 select-none">
          <div className="h-8 w-8 bg-black rounded-lg flex items-center justify-center font-bold text-white text-lg tracking-wider">
            W
          </div>
          <span className="font-extrabold text-xl text-black tracking-tight font-sans">
            WranKey
          </span>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-black/60">
          <a
            href="#features"
            className="hover:text-black transition-colors duration-200"
          >
            Platform
          </a>
          <a
            href="https://github.com/jaan-Nishar-Hussain/wrenkey"
            target="_blank"
            rel="noreferrer"
            className="hover:text-black transition-colors duration-200"
          >
            Developers
          </a>
          <a
            href="#policies"
            className="hover:text-black transition-colors duration-200"
          >
            Security & Policies
          </a>
          <a
            href="#sdk"
            className="hover:text-black transition-colors duration-200"
          >
            SDK
          </a>
        </nav>

        {/* Console CTA Button */}
        <div className="flex items-center space-x-4">
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center h-10 px-5 text-sm font-semibold text-white bg-black hover:bg-black/90 rounded-lg shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98]"
          >
            Launch Console
          </a>
        </div>
      </div>
    </header>
  );
}
