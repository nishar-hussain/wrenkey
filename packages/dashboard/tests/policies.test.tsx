import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => {
  const mockPush = vi.fn();
  const mockAddToast = vi.fn();
  const mockApiFetch = vi.fn();
  const mockUseAuth = vi.fn();
  return { mockPush, mockAddToast, mockApiFetch, mockUseAuth };
});
const { mockPush, mockAddToast, mockApiFetch, mockUseAuth } = mocks;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.mockPush }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: mocks.mockApiFetch,
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({
    addToast: mocks.mockAddToast,
    toasts: [],
    removeToast: vi.fn(),
  }),
}));

vi.mock("@/components/providers/Providers", () => ({
  useAuth: () => mocks.mockUseAuth(),
}));

import PoliciesPage from "@/app/(dashboard)/policies/page";

function makeAuth(overrides = {}) {
  return {
    isAuthenticated: true,
    token: "test-token",
    user: { id: "u1", role: "admin" },
    org: { id: "org1", name: "TestOrg" },
    login: vi.fn(),
    logout: vi.fn(),
    updateOrg: vi.fn(),
    ready: true,
    ...overrides,
  };
}

const policy = {
  id: "aa-bb-cc-dd-12",
  name: "Treasury Spending Limit",
  effect: "EFFECT_ALLOW",
  consensus: "approvers.any(user, user.id == 'abc')",
  conditions: { condition: "activity.action == 'SIGN'", description: "Allow signing", isTurnkey: true },
  priority: 0,
  active: true,
  createdAt: "2025-03-15T12:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockUseAuth.mockReturnValue(makeAuth());
  mockApiFetch.mockResolvedValue({ data: [], total: 0 });
});

function getActionButtons(): HTMLElement[] {
  return Array.from(document.querySelectorAll("button.h-7.w-7.p-0")) as HTMLElement[];
}

describe("Policies Page", () => {
  describe("Authentication", () => {
    it("redirects to /login when unauthenticated", async () => {
      mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: false, token: null }));
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/login");
      });
    });

    it("renders null when unauthenticated", () => {
      mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: false, token: null }));
      const { container } = render(<PoliciesPage />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("Loading and empty states", () => {
    it("shows skeleton when loading", () => {
      let resolve: any;
      mockApiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
      render(<PoliciesPage />);
      expect(screen.getByText("Policies")).toBeInTheDocument();
      expect(screen.queryByText("No policies found.")).toBeNull();
      resolve({ data: [], total: 0 });
    });

    it("shows empty state when no data", async () => {
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("No policies found.")).toBeInTheDocument();
      });
    });
  });

  describe("List rendering", () => {
    beforeEach(() => {
      mockApiFetch.mockResolvedValue({ data: [policy], total: 1 });
    });

    it("renders policy name", async () => {
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Treasury Spending Limit")).toBeInTheDocument();
      });
    });

    it("shows ALLOW badge", async () => {
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("ALLOW")).toBeInTheDocument();
      });
    });

    it("shows DENY badge for EFFECT_DENY", async () => {
      mockApiFetch.mockResolvedValue({
        data: [{ ...policy, effect: "EFFECT_DENY" }],
        total: 1,
      });
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("DENY")).toBeInTheDocument();
      });
    });

    it("shows Inactive badge when active=false", async () => {
      mockApiFetch.mockResolvedValue({
        data: [{ ...policy, active: false }],
        total: 1,
      });
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Inactive")).toBeInTheDocument();
      });
    });

    it("renders condition JSON in table row", async () => {
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText(/activity\.action/)).toBeInTheDocument();
      });
    });

    it("renders formatted creation date", async () => {
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Mar 15, 2025")).toBeInTheDocument();
      });
    });

    it("shows truncated ID", async () => {
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText(/aa-b/)).toBeInTheDocument();
      });
    });
  });

  describe("Search", () => {
    const alpha = { ...policy, id: "1", name: "Alpha Policy" };
    const beta = { ...policy, id: "2", name: "Beta Policy", effect: "EFFECT_DENY" };

    beforeEach(() => {
      mockApiFetch.mockResolvedValue({ data: [alpha, beta], total: 2 });
    });

    it("filters list by name", async () => {
      const user = userEvent.setup();
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Alpha Policy")).toBeInTheDocument();
        expect(screen.getByText("Beta Policy")).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText("Search policies...");
      await user.type(input, "Alpha");

      await waitFor(() => {
        expect(screen.getByText("Alpha Policy")).toBeInTheDocument();
        expect(screen.queryByText("Beta Policy")).toBeNull();
      });
    });
  });

  describe("Pagination", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...policy,
      id: `pol-${i}`,
      name: `Policy ${i}`,
    }));

    it("shows pagination controls when total exceeds limit", async () => {
      mockApiFetch.mockResolvedValue({ data: many.slice(0, 20), total: 25 });
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Prev")).toBeInTheDocument();
        expect(screen.getByText("Next")).toBeInTheDocument();
      });
    });

    it("shows correct range text", async () => {
      mockApiFetch.mockResolvedValue({ data: many.slice(0, 20), total: 25 });
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Showing 1–20 of 25")).toBeInTheDocument();
      });
    });

    it("calls API with updated offset on page change", async () => {
      mockApiFetch.mockResolvedValue({ data: many.slice(20, 25), total: 25 });
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Next")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Next"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/policies?limit=20&offset=20",
          { token: "test-token" }
        );
      });
    });
  });

  describe("CRUD operations", () => {
    beforeEach(() => {
      mockApiFetch.mockResolvedValue({ data: [], total: 0 });
    });

    it("opens create modal with default JSON", async () => {
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Policy/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Policy/ }));

      expect(screen.getByRole("heading", { name: "New Policy" })).toBeInTheDocument();
      const textarea: HTMLTextAreaElement = screen.getByPlaceholderText(/EFFECT_ALLOW/);
      expect(textarea).toBeInTheDocument();
      expect(textarea.value).toContain("EFFECT_ALLOW");
    });

    it("validates name is required", async () => {
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Policy/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Policy/ }));
      fireEvent.click(screen.getByRole("button", { name: "Create Policy" }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Name required", "error");
      });
    });

    it("validates JSON is parseable", async () => {
      const user = userEvent.setup();
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Policy/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Policy/ }));

      const nameInput = screen.getByPlaceholderText("e.g. Treasury Spending Limit");
      await user.type(nameInput, "Test");

      const textarea = screen.getByPlaceholderText(/EFFECT_ALLOW/);
      fireEvent.change(textarea, { target: { value: "not json" } });

      fireEvent.click(screen.getByRole("button", { name: "Create Policy" }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Invalid JSON", "error");
      });
    });

    it("validates effect field is present", async () => {
      const user = userEvent.setup();
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Policy/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Policy/ }));

      const nameInput = screen.getByPlaceholderText("e.g. Treasury Spending Limit");
      await user.type(nameInput, "Test");

      const textarea = screen.getByPlaceholderText(/EFFECT_ALLOW/);
      fireEvent.change(textarea, { target: { value: '{"foo":"bar"}' } });

      fireEvent.click(screen.getByRole("button", { name: "Create Policy" }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("effect required", "error");
      });
    });

    it("creates a policy via POST", async () => {
      const user = userEvent.setup();
      mockApiFetch
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [policy], total: 1 })
        .mockResolvedValueOnce({ data: [policy], total: 1 });

      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Policy/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Policy/ }));

      await user.type(
        screen.getByPlaceholderText("e.g. Treasury Spending Limit"),
        "My Policy"
      );
      await user.type(
        screen.getByPlaceholderText("Human-readable summary (optional)"),
        "A description"
      );

      const textarea = screen.getByPlaceholderText(/EFFECT_ALLOW/);
      fireEvent.change(textarea, { target: { value: '{"effect":"EFFECT_ALLOW","condition":"1==1"}' } });

      fireEvent.click(screen.getByRole("button", { name: "Create Policy" }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/policies",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("My Policy"),
          })
        );
      });

      const postCall = mockApiFetch.mock.calls.find(
        (c: any[]) => c[0] === "/policies" && c[1]?.method === "POST"
      );
      const body = JSON.parse(postCall[1].body);
      expect(body.name).toBe("My Policy");
      expect(body.effect).toBe("EFFECT_ALLOW");
      expect(body.consensus).toBe("ANY");
      expect(body.conditions.description).toBe("A description");
      expect(body.active).toBe(true);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Policy created", "success");
      });
    });

    it("opens edit modal", async () => {
      mockApiFetch.mockResolvedValue({ data: [policy], total: 1 });
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Treasury Spending Limit")).toBeInTheDocument();
      });

      const btns = getActionButtons();
      expect(btns.length).toBeGreaterThanOrEqual(2);
      fireEvent.click(btns[0]);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Edit Policy" })).toBeInTheDocument();
        expect(
          (screen.getByPlaceholderText("e.g. Treasury Spending Limit") as HTMLInputElement).value
        ).toBe("Treasury Spending Limit");
      });
    });

    it("updates policy via PATCH", async () => {
      const user = userEvent.setup();
      let call = 0;
      mockApiFetch.mockImplementation(() => {
        call++;
        if (call <= 4) return Promise.resolve({ data: [policy], total: 1 });
        return Promise.resolve({});
      });

      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Treasury Spending Limit")).toBeInTheDocument();
      });

      fireEvent.click(getActionButtons()[0]);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Edit Policy" })).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText("e.g. Treasury Spending Limit");
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Policy");

      fireEvent.click(screen.getByRole("button", { name: "Update Policy" }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/policies/aa-bb-cc-dd-12",
          expect.objectContaining({ method: "PATCH" })
        );
        expect(mockAddToast).toHaveBeenCalledWith("Policy updated", "success");
      });
    });

    it("deletes policy via DELETE", async () => {
      let call = 0;
      mockApiFetch.mockImplementation(() => {
        call++;
        if (call <= 4) return Promise.resolve({ data: [policy], total: 1 });
        return Promise.resolve({});
      });

      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByText("Treasury Spending Limit")).toBeInTheDocument();
      });

      const btns = getActionButtons();
      expect(btns.length).toBeGreaterThanOrEqual(2);
      fireEvent.click(btns[1]);

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/policies/aa-bb-cc-dd-12",
          expect.objectContaining({ method: "DELETE" })
        );
        expect(mockAddToast).toHaveBeenCalledWith("Policy deleted", "success");
      });
    });
  });

  describe("Error handling", () => {
    it("shows toast on fetch error", async () => {
      mockApiFetch.mockRejectedValue(new Error("Network error"));
      render(<PoliciesPage />);
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Failed to load data", "error");
      });
    });

    it("shows toast on save error", async () => {
      const user = userEvent.setup();
      let call = 0;
      mockApiFetch.mockImplementation(() => {
        call++;
        if (call <= 2) return Promise.resolve({ data: [], total: 0 });
        return Promise.reject(new Error("Conflict"));
      });

      render(<PoliciesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Policy/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Policy/ }));

      await user.type(
        screen.getByPlaceholderText("e.g. Treasury Spending Limit"),
        "Test"
      );

      fireEvent.click(screen.getByRole("button", { name: "Create Policy" }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Conflict", "error");
      });
    });
  });
});
