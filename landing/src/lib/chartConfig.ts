import {
  Chart,
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import type { RadarLabels } from "@/types";

export function registerChartComponents(): void {
  Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler);
}

export function createChart(canvas: HTMLCanvasElement, labels: RadarLabels): Chart {
  return new Chart(canvas, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          data: [0, 0, 0, 0, 0],
          backgroundColor: "rgba(207, 8, 31, 1)",
          borderColor: "rgba(207, 8, 31, 0.16)",
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 25,
            display: false,
          },
          grid: {
            color: "rgba(255, 255, 255, 0.12)",
            lineWidth: 1,
          },
          angleLines: {
            display: false,
          },
          pointLabels: {
            font: {
              family: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif',
              size: 10,
              weight: "bold",
            },
            color: "#ffffff",
            padding: 15,
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
    },
  });
}
