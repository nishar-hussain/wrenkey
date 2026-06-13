import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createContext, useContext } from "react";

describe("Dashboard API Client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it("apiFetch should add Authorization header with token", async () => {
    const { apiFetch } = await import("../src/lib/api");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: "test" }),
    });
    global.fetch = mockFetch;

    await apiFetch("/test", { token: "my-token" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/test"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-token",
        }),
      })
    );
  });

  it("apiFetch should throw on non-ok response", async () => {
    const { apiFetch } = await import("../src/lib/api");
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: "Unauthorized" } }),
    });

    await expect(apiFetch("/test")).rejects.toThrow("Unauthorized");
  });

  it("apiFetch should handle response without error message", async () => {
    const { apiFetch } = await import("../src/lib/api");
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    await expect(apiFetch("/test")).rejects.toThrow("HTTP 500");
  });
});

describe("Utility Functions", () => {
  it("cn should merge class names", async () => {
    const { cn } = await import("../src/lib/utils");
    expect(cn("text-sm", "font-bold")).toBe("text-sm font-bold");
    expect(cn("text-sm", false && "hidden")).toBe("text-sm");
    expect(cn("text-sm", undefined)).toBe("text-sm");
  });
});

describe("Auth Provider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should expose useAuth hook", async () => {
    const { useAuth } = await import("../src/components/providers/Providers");
    expect(typeof useAuth).toBe("function");
  });

  it("should expose Providers component", async () => {
    const { Providers } = await import("../src/components/providers/Providers");
    expect(Providers).toBeDefined();
    expect(typeof Providers).toBe("function");
  });
});

describe("ErrorBoundary", () => {
  it("should export ErrorBoundary component", async () => {
    const { ErrorBoundary } = await import("../src/components/ui/ErrorBoundary");
    expect(ErrorBoundary).toBeDefined();
  });
});
