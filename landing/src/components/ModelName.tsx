"use client";

export function ModelName({ ref }: { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full z-[1] select-none pointer-events-none text-center pl-[14.25%] pr-[15.75%]">
      <div
        ref={ref}
        className="inline-block font-bold text-white opacity-5 uppercase whitespace-pre-line tracking-[-0.06em] leading-[0.85] max-h-full"
      />
    </div>
  );
}
