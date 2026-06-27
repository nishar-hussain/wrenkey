"use client";

export function SnowboardImage({
  ref,
  initialSrc,
}: {
  ref?: React.Ref<HTMLImageElement>;
  initialSrc: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- GSAP swaps src imperatively mid-animation; next/image doesn't support this
    <img
      ref={ref}
      src={initialSrc}
      alt="Snowboard"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[60vh] z-[5] pointer-events-none object-contain"
    />
  );
}
