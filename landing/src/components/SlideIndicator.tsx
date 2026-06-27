"use client";

export function SlideIndicator({
  indicatorRef,
  thumbRef,
  modelCount,
}: {
  indicatorRef: React.Ref<HTMLDivElement>;
  thumbRef: React.Ref<HTMLDivElement>;
  modelCount: number;
}) {
  return (
    <div
      ref={indicatorRef}
      className="fixed right-[1.875%] top-1/2 -translate-y-1/2 w-[2px] h-[18.87vh] bg-black/10 z-10"
    >
      <div
        ref={thumbRef}
        className="absolute top-0 left-0 w-[2px] bg-[#2563eb]"
        style={{ height: `${100 / modelCount}%` }}
      />
    </div>
  );
}
