import "@testing-library/jest-dom/vitest";

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn() },
  writable: true,
  configurable: true,
});
