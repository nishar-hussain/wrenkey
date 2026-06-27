"use client";

export function RadarChart({
  containerRef,
  canvasRef,
}: {
  containerRef: React.Ref<HTMLDivElement>;
  canvasRef: React.Ref<HTMLCanvasElement>;
}) {
  return (
    <div
      ref={containerRef}
      className="absolute top-1/2 left-1/2 md:left-[60%] lg:left-[62%] -translate-x-1/2 -translate-y-1/2 w-[85vh] max-w-[85vw] aspect-square z-[2] mix-blend-multiply transition-[left] duration-300"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}


