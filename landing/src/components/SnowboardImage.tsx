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
  const parallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!floatRef.current || !parallaxRef.current) return;
    
    // Continuous smooth floating animation
    const tl = gsap.to(floatRef.current, {
      y: 15,
      duration: 3,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });

    // Mouse parallax effect
    const xTo = gsap.quickTo(parallaxRef.current, "x", { duration: 0.8, ease: "power3.out" });
    const yTo = gsap.quickTo(parallaxRef.current, "y", { duration: 0.8, ease: "power3.out" });
    const rotXTo = gsap.quickTo(parallaxRef.current, "rotationX", { duration: 0.8, ease: "power3.out" });
    const rotYTo = gsap.quickTo(parallaxRef.current, "rotationY", { duration: 0.8, ease: "power3.out" });

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth - 0.5) * 2; // -1 to 1
      const y = (e.clientY / innerHeight - 0.5) * 2; // -1 to 1
      
      xTo(x * 40);
      yTo(y * 40);
      rotXTo(y * -15);
      rotYTo(x * 15);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      tl.kill();
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <div
      className="absolute top-1/2 left-1/2 md:left-[60%] lg:left-[62%] -translate-x-1/2 -translate-y-1/2 h-[60vh] z-[5] pointer-events-none perspective-[1000px]"
    >
      <div ref={floatRef} className="w-full h-full transform-style-3d">
        <div ref={parallaxRef} className="w-full h-full transform-style-3d">
          {/* eslint-disable-next-line @next/next/no-img-element -- GSAP swaps src imperatively mid-animation; next/image doesn't support this */}
          <img
            ref={ref}
            src={initialSrc}
            alt="WranKey Wrenchy"
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
