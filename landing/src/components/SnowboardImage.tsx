"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function SnowboardImage({
  ref,
  initialSrc,
}: {
  ref?: React.Ref<HTMLImageElement>;
  initialSrc: string;
}) {
  const floatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!floatRef.current) return;
    
    // Continuous smooth floating animation
    const tl = gsap.to(floatRef.current, {
      y: 20,
      duration: 2.5,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div
      ref={floatRef}
      className="absolute top-1/2 left-1/2 md:left-[60%] lg:left-[62%] -translate-x-1/2 -translate-y-1/2 h-[60vh] z-[5] pointer-events-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- GSAP swaps src imperatively mid-animation; next/image doesn't support this */}
      <img
        ref={ref}
        src={initialSrc}
        alt="WranKey Wrenchy"
        className="w-full h-full object-contain"
      />
    </div>
  );
}
