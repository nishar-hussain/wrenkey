import type { SnowboardModel, RadarLabels } from "@/types";

export const MODELS: SnowboardModel[] = [
  { name: "DART", values: [100, 40, 40, 100, 80], img: "/img/dart.png" },
  { name: "PENCIL", values: [90, 70, 70, 80, 70], img: "/img/pencil.png" },
  { name: "OTTO", values: [50, 100, 100, 60, 60], img: "/img/otto.png" },
  {
    name: "TRANSITION\nFINDER",
    values: [90, 100, 100, 100, 70],
    img: "/img/transition-finder.png",
  },
  {
    name: "CAFE\nRACER",
    values: [65, 55, 45, 65, 90],
    img: "/img/cafe-racer.png",
  },
];

export const LABELS: RadarLabels = [
  "POWDER",
  "SIDEHITS",
  "FREESTYLE/JIBBING",
  "TREES",
  "CARVING",
];
