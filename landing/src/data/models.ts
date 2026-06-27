import type { SnowboardModel, RadarLabels } from "@/types";

export const MODELS: SnowboardModel[] = [
  {
    name: "AGENT\nWALLETS",
    values: [95, 90, 85, 95, 90],
    img: "/img/wrenchy-blue.png",
    color: "rgba(37, 99, 235, 0.85)",
    borderColor: "rgba(37, 99, 235, 0.16)",
  },
  {
    name: "EMBEDDED\nWALLETS",
    values: [90, 80, 100, 95, 80],
    img: "/img/wrenchy-purple.png",
    color: "rgba(168, 85, 247, 0.85)",
    borderColor: "rgba(168, 85, 247, 0.16)",
  },
  {
    name: "POLICY\nENGINE",
    values: [95, 85, 80, 75, 100],
    img: "/img/wrenchy-emerald.png",
    color: "rgba(16, 185, 129, 0.85)",
    borderColor: "rgba(16, 185, 129, 0.16)",
  },
  {
    name: "MULTI-SIG\nFLOWS",
    values: [100, 70, 75, 80, 95],
    img: "/img/wrenchy-orange.png",
    color: "rgba(249, 115, 22, 0.85)",
    borderColor: "rgba(249, 115, 22, 0.16)",
  },
  {
    name: "TRANSACTION\nSAFETY",
    values: [100, 75, 90, 85, 90],
    img: "/img/wrenchy-cyan.png",
    color: "rgba(6, 182, 212, 0.85)",
    borderColor: "rgba(6, 182, 212, 0.16)",
  },
];

export const LABELS: RadarLabels = [
  "SECURITY",
  "AUTOMATION",
  "SPEED",
  "INTEGRATION",
  "COMPLIANCE",
];
