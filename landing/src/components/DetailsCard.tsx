"use client";

import React from "react";
import type { SnowboardModel } from "@/types";

interface DetailsCardProps {
  model: SnowboardModel;
  index: number;
  total: number;
  innerRef: React.RefObject<HTMLDivElement | null>;
}

export function DetailsCard({ model, index, total, innerRef }: DetailsCardProps) {
  // Format the index as a two-digit string (e.g., 01)
  const formattedIndex = String(index + 1).padStart(2, "0");
  const formattedTotal = String(total).padStart(2, "0");

  return (
    <div className="absolute left-6 md:left-12 lg:left-20 top-1/2 -translate-y-1/2 w-[calc(100vw-48px)] max-w-[450px] z-20 pointer-events-none md:pointer-events-auto">
      {/* Outer wrapper - stays static, inner content is faded and shifted by GSAP */}
      <div 
        ref={innerRef as any}
        className="bg-white/50 backdrop-blur-xl border border-black/[0.08] rounded-3xl p-6 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.05)] flex flex-col pointer-events-auto transition-shadow hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)]"
      >
        {/* Top Meta info */}
        <div className="flex items-center justify-between mb-6">
          <span className="card-index text-xs font-mono font-bold tracking-widest text-black/40">
            {formattedIndex} / {formattedTotal}
          </span>
          <span 
            className="card-pill text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full text-white transition-colors duration-300"
            style={{ backgroundColor: model.color }}
          >
            Platform Capability
          </span>
        </div>

        {/* Title & Tagline */}
        <h2 className="card-title text-2xl md:text-3xl font-black text-black tracking-tight leading-none mb-1 uppercase font-sans">
          {model.name.replace("\n", " ")}
        </h2>
        <p 
          className="card-tagline text-sm font-bold tracking-wide mb-4 transition-colors duration-300"
          style={{ color: model.color }}
        >
          {model.tagline}
        </p>

        {/* Description */}
        <p className="card-description text-sm md:text-base text-black/70 leading-relaxed mb-6">
          {model.description}
        </p>

        {/* Divider */}
        <div className="border-t border-black/[0.06] my-2" />

        {/* Features Checklist */}
        <div className="my-4 space-y-3">
          <h4 className="text-xs font-bold text-black/40 uppercase tracking-widest mb-1">
            Core Specifications
          </h4>
          <ul className="card-features space-y-2">
            {model.features.map((feat, idx) => (
              <li key={idx} className="flex items-start text-xs text-black/80 font-medium leading-normal">
                <svg
                  className="w-4 h-4 mr-2.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                  style={{ color: model.color }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 mt-6">
          <a
            href={model.ctaUrl}
            className="card-cta flex-1 inline-flex items-center justify-center h-11 text-xs font-bold text-white rounded-xl shadow-sm hover:shadow transition-all duration-300 active:scale-[0.98]"
            style={{ backgroundColor: model.color }}
          >
            Deploy Feature
          </a>
          <a
            href="https://github.com/jaan-Nishar-Hussain/wrenkey"
            target="_blank"
            rel="noreferrer"
            className="flex-1 inline-flex items-center justify-center h-11 text-xs font-bold text-black bg-black/[0.05] hover:bg-black/[0.08] rounded-xl transition-all duration-200"
          >
            View Docs
          </a>
        </div>
      </div>
    </div>
  );
}
