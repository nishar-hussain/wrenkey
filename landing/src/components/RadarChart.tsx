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
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vh] max-w-[90vw] aspect-square z-[2] mix-blend-multiply"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
