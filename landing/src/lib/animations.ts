import gsap from "gsap";
import type { Chart } from "chart.js";
import type { SnowboardModel } from "@/types";
import { fitText } from "./fitText";

interface Refs {
  modelName: HTMLDivElement;
  chartContainer: HTMLDivElement;
  canvas: HTMLCanvasElement;
  snowboard: HTMLImageElement;
  indicator: HTMLDivElement;
  thumb: HTMLDivElement;
}

export function playEntrance(
  refs: Refs,
  firstModel: SnowboardModel,
  chart: Chart,
): gsap.core.Timeline {
  refs.modelName.textContent = firstModel.name;
  fitText(refs.modelName);

  const segmentHeight = 100 / 5; // MODELS.length
  refs.thumb.style.height = segmentHeight + "%";
  refs.thumb.style.top = "0%";

  const tl = gsap.timeline();

  // 1. Model name
  gsap.set(refs.modelName, { opacity: 0, y: 20 });
  tl.to(refs.modelName, { opacity: 0.1, y: 0, duration: 0.5, ease: "power2.out" }, 0);

  // 2. Chart canvas
  gsap.set(refs.chartContainer, { opacity: 0 });
  tl.to(refs.chartContainer, { opacity: 1, duration: 0.4, ease: "power2.out" }, 0.1);

  // 3. Data polygon morph from center
  const proxy = { v0: 0, v1: 0, v2: 0, v3: 0, v4: 0 };
  tl.to(
    proxy,
    {
      v0: firstModel.values[0],
      v1: firstModel.values[1],
      v2: firstModel.values[2],
      v3: firstModel.values[3],
      v4: firstModel.values[4],
      duration: 0.6,
      ease: "power3.out",
      onUpdate: () => {
        chart.data.datasets[0].data = [proxy.v0, proxy.v1, proxy.v2, proxy.v3, proxy.v4];
        chart.update("none");
      },
    },
    0.2,
  );

  // 4. Indicator track
  gsap.set(refs.indicator, { opacity: 0 });
  tl.to(refs.indicator, { opacity: 1, duration: 0.3, ease: "power2.out" }, 0.3);

  // 5. Snowboard
  gsap.set(refs.snowboard, { opacity: 0, y: 20 });
  tl.to(refs.snowboard, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.15);

  // 6. Indicator thumb
  gsap.set(refs.thumb, { scaleY: 0, transformOrigin: "top" });
  tl.to(refs.thumb, { scaleY: 1, duration: 0.4, ease: "power2.inOut" }, 0.4);

  return tl;
}

export function transitionToModel(
  newIndex: number,
  refs: Refs,
  models: SnowboardModel[],
  currentIndexRef: React.RefObject<number>,
  isAnimatingRef: React.RefObject<boolean>,
  chart: Chart,
): void {
  if (isAnimatingRef.current) return;
  if (newIndex < 0 || newIndex >= models.length) return;
  if (newIndex === currentIndexRef.current) return;

  isAnimatingRef.current = true;

  const oldIndex = currentIndexRef.current;
  const oldValues = models[oldIndex].values;
  const newModel = models[newIndex];
  const newValues = newModel.values;

  const tl = gsap.timeline({
    onComplete: () => {
      currentIndexRef.current = newIndex;
      isAnimatingRef.current = false;
    },
  });

  // 1. Model name crossfade
  tl.to(
    refs.modelName,
    {
      opacity: 0,
      y: 30,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => {
        refs.modelName.textContent = newModel.name;
        fitText(refs.modelName);
        gsap.set(refs.modelName, { y: -30 });
      },
    },
    0,
  );
  tl.to(refs.modelName, { opacity: 0.1, y: 0, duration: 0.5, ease: "power2.out" }, 0.4);

  // 2. Radar chart morph
  const proxy = {
    v0: oldValues[0],
    v1: oldValues[1],
    v2: oldValues[2],
    v3: oldValues[3],
    v4: oldValues[4],
  };
  tl.to(
    proxy,
    {
      v0: newValues[0],
      v1: newValues[1],
      v2: newValues[2],
      v3: newValues[3],
      v4: newValues[4],
      duration: 0.8,
      ease: "power2.inOut",
      onUpdate: () => {
        chart.data.datasets[0].data = [proxy.v0, proxy.v1, proxy.v2, proxy.v3, proxy.v4];
        chart.update("none");
      },
    },
    0,
  );

  // 3. Snowboard crossfade
  tl.to(
    refs.snowboard,
    {
      opacity: 0,
      y: 20,
      duration: 0.3,
      ease: "power2.in",
      onComplete: () => {
        refs.snowboard.src = newModel.img;
        gsap.set(refs.snowboard, { y: -20 });
      },
    },
    0,
  );
  tl.to(refs.snowboard, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.35);

  // 4. Indicator thumb — elastic stretch effect
  const segmentPct = 100 / models.length;
  const oldTop = oldIndex * segmentPct;
  const oldBottom = oldTop + segmentPct;
  const newTop = newIndex * segmentPct;
  const newBottom = newTop + segmentPct;
  const goingDown = newIndex > oldIndex;

  const edges = { top: oldTop, bottom: oldBottom };

  function updateThumbFromEdges() {
    refs.thumb.style.top = edges.top + "%";
    refs.thumb.style.height = edges.bottom - edges.top + "%";
  }

  // Leading edge moves fast
  tl.to(
    edges,
    {
      [goingDown ? "bottom" : "top"]: goingDown ? newBottom : newTop,
      duration: 0.35,
      ease: "power3.out",
      onUpdate: updateThumbFromEdges,
    },
    0,
  );

  // Trailing edge catches up
  tl.to(
    edges,
    {
      [goingDown ? "top" : "bottom"]: goingDown ? newTop : newBottom,
      duration: 0.45,
      ease: "power2.inOut",
      onUpdate: updateThumbFromEdges,
    },
    0.08,
  );
}
