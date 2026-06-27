"use client";

import { useEffect, useRef } from "react";
import type { Chart } from "chart.js";
import gsap from "gsap";
import { MODELS, LABELS } from "@/data/models";
import { registerChartComponents, createChart } from "@/lib/chartConfig";
import { fitText } from "@/lib/fitText";
import { playEntrance, transitionToModel } from "@/lib/animations";
import { ModelName } from "./ModelName";
import { RadarChart } from "./RadarChart";
import { SnowboardImage } from "./SnowboardImage";
import { SlideIndicator } from "./SlideIndicator";
import { Header } from "./Header";
import { DetailsCard } from "./DetailsCard";

const SWIPE_THRESHOLD = 50;

export function SnowboardSelector() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const modelNameRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snowboardRef = useRef<HTMLImageElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const detailsCardRef = useRef<HTMLDivElement>(null);
  const bgGlowRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const currentIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const modelName = modelNameRef.current;
    const chartContainer = chartContainerRef.current;
    const canvas = canvasRef.current;
    const snowboard = snowboardRef.current;
    const indicator = indicatorRef.current;
    const thumb = thumbRef.current;
    const detailsCard = detailsCardRef.current;

    if (
      !wrapper ||
      !modelName ||
      !chartContainer ||
      !canvas ||
      !snowboard ||
      !indicator ||
      !thumb ||
      !detailsCard ||
      !bgGlowRef.current
    )
      return;

    // Clean up previous instance (StrictMode double-mount)
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    // GSAP context scoped to wrapper element
    const ctx = gsap.context(() => {}, wrapper);

    // Chart.js setup
    registerChartComponents();
    const chart = createChart(canvas, LABELS);
    chartInstanceRef.current = chart;

    const refs = {
      modelName,
      chartContainer,
      canvas,
      snowboard,
      indicator,
      thumb,
      detailsCard,
      bgGlow: bgGlowRef.current,
    };

    // Reset state for StrictMode
    currentIndexRef.current = 0;
    isAnimatingRef.current = false;

    // Entrance animation
    ctx.add(() => {
      playEntrance(refs, MODELS[0], chart);
    });

    // Preload all images
    for (const model of MODELS) {
      const img = new Image();
      img.src = model.img;
    }

    // --- Event handlers ---
    let touchStartY = 0;

    function go(delta: number) {
      transitionToModel(
        currentIndexRef.current + delta,
        refs,
        MODELS,
        currentIndexRef,
        isAnimatingRef,
        chart,
      );
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (isAnimatingRef.current) return;
      if (e.deltaY > 0) go(1);
      else if (e.deltaY < 0) go(-1);
    }

    // Capture standard touch events to support swipe
    function onTouchStart(e: TouchEvent) {
      touchStartY = e.touches[0].clientY;
    }

    function onTouchEnd(e: TouchEvent) {
      const deltaY = touchStartY - e.changedTouches[0].clientY;
      if (Math.abs(deltaY) < SWIPE_THRESHOLD) return;
      if (isAnimatingRef.current) return;
      if (deltaY > 0) go(1);
      else if (deltaY < 0) go(-1);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isAnimatingRef.current) return;
      if (e.key === "ArrowDown") go(1);
      else if (e.key === "ArrowUp") go(-1);
    }

    function onResize() {
      if (modelNameRef.current) fitText(modelNameRef.current);
      if (thumbRef.current) {
        const segmentHeight = 100 / MODELS.length;
        thumbRef.current.style.top =
          currentIndexRef.current * segmentHeight + "%";
        thumbRef.current.style.height = segmentHeight + "%";
      }
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return () => {
      ctx.revert();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative w-screen h-screen overflow-hidden bg-zinc-950"
    >
      <div 
        ref={bgGlowRef}
        className="absolute top-1/2 left-1/2 md:left-[60%] lg:left-[62%] -translate-x-1/2 -translate-y-1/2 w-[120vw] h-[120vw] md:w-[60vw] md:h-[60vw] rounded-full blur-[140px] opacity-0 pointer-events-none"
      />
      <Header />
      <ModelName ref={modelNameRef} />
      <DetailsCard
        model={MODELS[0]}
        index={0}
        total={MODELS.length}
        innerRef={detailsCardRef}
      />
      <RadarChart containerRef={chartContainerRef} canvasRef={canvasRef} />
      <SnowboardImage ref={snowboardRef} initialSrc={MODELS[0].img} />
      <SlideIndicator
        indicatorRef={indicatorRef}
        thumbRef={thumbRef}
        modelCount={MODELS.length}
      />
    </div>
  );
}

