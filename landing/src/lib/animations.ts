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
  detailsCard: HTMLDivElement;
  bgGlow: HTMLDivElement;
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

  chart.data.datasets[0].backgroundColor = firstModel.color;
  chart.data.datasets[0].borderColor = firstModel.borderColor;

  const tl = gsap.timeline();

  // 1. Model name background
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

  // 5. Snowboard image
  gsap.set(refs.snowboard, { opacity: 0, y: 20 });
  tl.to(refs.snowboard, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.15);

  // 6. Indicator thumb
  gsap.set(refs.thumb, { scaleY: 0, transformOrigin: "top" });
  tl.to(refs.thumb, { scaleY: 1, duration: 0.4, ease: "power2.inOut" }, 0.4);

  // 7. Details card floating on the left
  gsap.set(refs.detailsCard, { opacity: 0, x: -30 });
  tl.to(refs.detailsCard, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, 0.2);

  const cardElements = refs.detailsCard.querySelectorAll(".card-title, .card-tagline, .card-description, .card-features li, .card-cta, .card-docs");
  if (cardElements.length > 0) {
    gsap.set(cardElements, { opacity: 0, y: 15 });
    tl.to(cardElements, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: "power2.out" }, 0.4);
  }

  // 8. BG Glow
  gsap.set(refs.bgGlow, { backgroundColor: firstModel.color, opacity: 0, scale: 0.8 });
  tl.to(refs.bgGlow, { opacity: 0.2, scale: 1, duration: 1.5, ease: "power2.out" }, 0);

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
  const oldModel = models[oldIndex];
  const oldValues = oldModel.values;
  const newModel = models[newIndex];
  const newValues = newModel.values;

  const tl = gsap.timeline({
    onComplete: () => {
      currentIndexRef.current = newIndex;
      isAnimatingRef.current = false;
    },
  });

  // 1. Model name background crossfade
  tl.to(
    refs.modelName,
    {
      opacity: 0,
      y: 30,
      duration: 0.4,
      ease: "power3.in",
      onComplete: () => {
        refs.modelName.textContent = newModel.name;
        fitText(refs.modelName);
        gsap.set(refs.modelName, { y: -30 });
      },
    },
    0,
  );
  tl.to(refs.modelName, { opacity: 0.1, y: 0, duration: 0.6, ease: "power3.out" }, 0.4);

  // Background glow crossfade
  tl.to(refs.bgGlow, { backgroundColor: newModel.color, duration: 0.8, ease: "power2.inOut" }, 0);

  // 2. Radar chart morph
  const proxy = {
    v0: oldValues[0],
    v1: oldValues[1],
    v2: oldValues[2],
    v3: oldValues[3],
    v4: oldValues[4],
    backgroundColor: oldModel.color,
    borderColor: oldModel.borderColor,
  };
  tl.to(
    proxy,
    {
      v0: newValues[0],
      v1: newValues[1],
      v2: newValues[2],
      v3: newValues[3],
      v4: newValues[4],
      backgroundColor: newModel.color,
      borderColor: newModel.borderColor,
      duration: 0.8,
      ease: "power3.inOut",
      onUpdate: () => {
        chart.data.datasets[0].data = [proxy.v0, proxy.v1, proxy.v2, proxy.v3, proxy.v4];
        chart.data.datasets[0].backgroundColor = proxy.backgroundColor;
        chart.data.datasets[0].borderColor = proxy.borderColor;
        chart.update("none");
      },
    },
    0,
  );

  // 3. Snowboard image crossfade
  tl.to(
    refs.snowboard,
    {
      opacity: 0,
      y: 20,
      duration: 0.3,
      ease: "power3.in",
      onComplete: () => {
        refs.snowboard.src = newModel.img;
        gsap.set(refs.snowboard, { y: -20 });
      },
    },
    0,
  );
  tl.to(refs.snowboard, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 0.35);

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
      ease: "power3.inOut",
      onUpdate: updateThumbFromEdges,
    },
    0.08,
  );

  // 5. Details card content swap and fade transition
  tl.to(
    refs.detailsCard,
    {
      opacity: 0,
      x: -20,
      duration: 0.35,
      ease: "power3.in",
      onComplete: () => {
        const indexEl = refs.detailsCard.querySelector(".card-index");
        const pillEl = refs.detailsCard.querySelector(".card-pill") as HTMLElement;
        const titleEl = refs.detailsCard.querySelector(".card-title");
        const taglineEl = refs.detailsCard.querySelector(".card-tagline") as HTMLElement;
        const descEl = refs.detailsCard.querySelector(".card-description");
        const featuresEl = refs.detailsCard.querySelector(".card-features");
        const ctaEl = refs.detailsCard.querySelector(".card-cta") as HTMLElement;
        const docsEl = refs.detailsCard.querySelector(".card-docs") as HTMLElement;

        const formattedIndex = String(newIndex + 1).padStart(2, "0");
        const formattedTotal = String(models.length).padStart(2, "0");

        if (indexEl) indexEl.textContent = `${formattedIndex} / ${formattedTotal}`;
        if (pillEl) pillEl.style.backgroundColor = newModel.color;
        if (titleEl) titleEl.textContent = newModel.name.replace("\n", " ");
        if (taglineEl) {
          taglineEl.textContent = newModel.tagline;
          taglineEl.style.color = newModel.color;
        }
        if (descEl) descEl.textContent = newModel.description;
        if (ctaEl) {
          ctaEl.setAttribute("href", newModel.ctaUrl);
          ctaEl.style.backgroundColor = newModel.color;
        }

        if (featuresEl) {
          featuresEl.innerHTML = newModel.features
            .map(
              (feat) => `
              <li class="flex items-start text-xs text-white/80 font-medium leading-normal opacity-0 translate-y-2">
                <svg
                  class="w-4 h-4 mr-2.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  viewBox="0 0 24 24"
                  style="color: ${newModel.color}"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                <span>${feat}</span>
              </li>
            `
            )
            .join("");
        }

        gsap.set(refs.detailsCard, { x: 20 });
        
        // Reset element opacities for stagger animation
        const newElements = refs.detailsCard.querySelectorAll(".card-title, .card-tagline, .card-description, .card-features li, .card-cta, .card-docs");
        if (newElements.length > 0) {
          gsap.set(newElements, { opacity: 0, y: 15 });
        }
      },
    },
    0,
  );
  
  tl.to(refs.detailsCard, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }, 0.35);
  
  const cardElements = refs.detailsCard.querySelectorAll(".card-title, .card-tagline, .card-description, .card-features li, .card-cta, .card-docs");
  if (cardElements.length > 0) {
    tl.to(cardElements, { opacity: 1, y: 0, duration: 0.4, stagger: 0.04, ease: "power2.out" }, 0.45);
  }
}

