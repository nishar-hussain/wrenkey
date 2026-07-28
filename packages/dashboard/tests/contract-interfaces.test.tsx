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

import ContractInterfacesPage from "@/app/(dashboard)/contract-interfaces/page";

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

const sampleAbi = [
  { type: "function", name: "transfer", inputs: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
  ], outputs: [] },
  { type: "function", name: "balanceOf", inputs: [
    { name: "owner", type: "address" },
  ], outputs: [{ type: "uint256" }] },
  { type: "event", name: "Transfer" },
];

const iface = {
  id: "if-abc-1234",
  name: "USDC Token",
  address: "0xabc123def456789012345678901234567890abcd",
  notes: "USDC on Sepolia",
  interfaceType: "custom",
  chainType: "stellar-testnet",
  abi: sampleAbi,
  createdAt: "2025-06-01T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockUseAuth.mockReturnValue(makeAuth());
  mockApiFetch.mockResolvedValue({ data: [], total: 0 });
});

function getActionButtons(): HTMLElement[] {
  return Array.from(document.querySelectorAll("button.h-7.w-7.p-0")) as HTMLElement[];
}

describe("Contract Interfaces Page", () => {
  describe("Authentication", () => {
    it("redirects to /login when unauthenticated", async () => {
      mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: false, token: null }));
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/login");
      });
    });

    it("renders null when unauthenticated", () => {
      mockUseAuth.mockReturnValue(makeAuth({ isAuthenticated: false, token: null }));
      const { container } = render(<ContractInterfacesPage />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("Loading and empty states", () => {
    it("shows skeleton when loading", () => {
      let resolve: any;
      mockApiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
      render(<ContractInterfacesPage />);
      expect(screen.getByText("Smart Contract Interfaces")).toBeInTheDocument();
      expect(screen.queryByText(/No smart contract interfaces found/)).toBeNull();
      resolve({ data: [], total: 0 });
    });

    it("shows empty state with descriptive message", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText(/No smart contract interfaces found/)).toBeInTheDocument();
      });
    });
  });

  describe("List rendering", () => {
    beforeEach(() => {
      mockApiFetch.mockResolvedValue({ data: [iface], total: 1 });
    });

    it("renders interface name", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
      });
    });

    it("shows function count", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("2 functions")).toBeInTheDocument();
      });
    });

    it("shows truncated address", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText(/0xabc123/)).toBeInTheDocument();
      });
    });

    it("shows zero functions when abi is empty", async () => {
      mockApiFetch.mockResolvedValue({
        data: [{ ...iface, abi: [] }],
        total: 1,
      });
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("0 functions")).toBeInTheDocument();
      });
    });

    it("shows Stellar Testnet badge", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("Stellar Testnet")).toBeInTheDocument();
      });
    });

    it("shows Sepolia badge for ethereum chain", async () => {
      mockApiFetch.mockResolvedValue({
        data: [{ ...iface, chainType: "sepolia" }],
        total: 1,
      });
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("SEPOLIA")).toBeInTheDocument();
      });
    });

    it("renders formatted creation date", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("Jun 1, 2025")).toBeInTheDocument();
      });
    });
  });

  describe("Search", () => {
    const usdc = { ...iface, id: "1", name: "USDC Token", address: "0xusdc" };
    const usdt = { ...iface, id: "2", name: "USDT Token", address: "0xusdt" };

    beforeEach(() => {
      mockApiFetch.mockResolvedValue({ data: [usdc, usdt], total: 2 });
    });

    it("filters by name", async () => {
      const user = userEvent.setup();
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
        expect(screen.getByText("USDT Token")).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText("Search interfaces...");
      await user.type(input, "USDC");

      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
        expect(screen.queryByText("USDT Token")).toBeNull();
      });
    });

    it("filters by address", async () => {
      const user = userEvent.setup();
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getAllByText(/Token/).length).toBe(2);
      });

      const input = screen.getByPlaceholderText("Search interfaces...");
      await user.type(input, "0xusdc");

      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
        expect(screen.queryByText("USDT Token")).toBeNull();
      });
    });
  });

  describe("CRUD operations", () => {
    beforeEach(() => {
      mockApiFetch.mockResolvedValue({ data: [], total: 0 });
    });

    it("opens create modal with empty form", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Interface/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Interface/ }));

      expect(screen.getByRole("heading", { name: "New Smart Contract Interface" })).toBeInTheDocument();
      expect(screen.getByPlaceholderText("e.g. USDC (ERC-20)")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("0x...")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Optional notes about this contract")).toBeInTheDocument();
    });

    it("validates name is required", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Interface/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Interface/ }));
      fireEvent.click(screen.getByRole("button", { name: "Create Interface" }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Name required", "error");
      });
    });

    it("chain selector has correct options", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Interface/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Interface/ }));

      const select: HTMLSelectElement = screen.getByDisplayValue("Stellar Testnet");
      expect(select).toBeInTheDocument();
      const optTexts = Array.from(select.options).map((o) => o.textContent);
      expect(optTexts).toContain("Stellar Testnet");
      expect(optTexts).toContain("Sepolia");
    });

    it("creates interface via POST", async () => {
      const user = userEvent.setup();
      mockApiFetch
        .mockResolvedValueOnce({ data: [], total: 0 })
        .mockResolvedValueOnce({ data: [iface], total: 1 })
        .mockResolvedValueOnce({ data: [iface], total: 1 });

      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Interface/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Interface/ }));

      await user.type(screen.getByPlaceholderText("e.g. USDC (ERC-20)"), "My Contract");
      await user.type(screen.getByPlaceholderText("0x..."), "0x123");

      const abiTextarea = screen.getByPlaceholderText(/{"type":"function"/);
      fireEvent.change(abiTextarea, { target: { value: JSON.stringify(sampleAbi) } });

      fireEvent.click(screen.getByRole("button", { name: "Create Interface" }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/contract-interfaces",
          expect.objectContaining({ method: "POST" })
        );
      });

      const postCall = mockApiFetch.mock.calls.find(
        (c: any[]) => c[0] === "/contract-interfaces" && c[1]?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body);
      expect(body.name).toBe("My Contract");
      expect(body.address).toBe("0x123");
      expect(body.chainType).toBe("stellar-testnet");

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Interface created", "success");
      });
    });

    it("opens edit modal", async () => {
      mockApiFetch.mockResolvedValue({ data: [iface], total: 1 });
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
      });

      const btns = getActionButtons();
      expect(btns.length).toBeGreaterThanOrEqual(3);
      fireEvent.click(btns[1]); // Play=0, Edit=1

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Edit Contract Interface" })).toBeInTheDocument();
        expect(
          (screen.getByPlaceholderText("e.g. USDC (ERC-20)") as HTMLInputElement).value
        ).toBe("USDC Token");
      });
    });

    it("updates interface via PATCH", async () => {
      const user = userEvent.setup();
      let call = 0;
      mockApiFetch.mockImplementation(() => {
        call++;
        if (call <= 4) return Promise.resolve({ data: [iface], total: 1 });
        return Promise.resolve({});
      });

      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
      });

      fireEvent.click(getActionButtons()[1]);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Edit Contract Interface" })).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText("e.g. USDC (ERC-20)");
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Contract");
      fireEvent.click(screen.getByRole("button", { name: "Update Interface" }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/contract-interfaces/if-abc-1234",
          expect.objectContaining({ method: "PATCH" })
        );
        expect(mockAddToast).toHaveBeenCalledWith("Interface updated", "success");
      });
    });

    it("deletes interface via DELETE", async () => {
      let call = 0;
      mockApiFetch.mockImplementation(() => {
        call++;
        if (call <= 4) return Promise.resolve({ data: [iface], total: 1 });
        return Promise.resolve({});
      });

      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
      });

      const btns = getActionButtons();
      expect(btns.length).toBeGreaterThanOrEqual(3);
      fireEvent.click(btns[2]);

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/contract-interfaces/if-abc-1234",
          expect.objectContaining({ method: "DELETE" })
        );
        expect(mockAddToast).toHaveBeenCalledWith("Interface deleted", "success");
      });
    });
  });

  describe("ABI preview", () => {
    it("shows detected functions when ABI is valid JSON", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Interface/ })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /New Interface/ }));

      const textarea = screen.getByPlaceholderText(/{"type":"function"/);
      fireEvent.change(textarea, { target: { value: JSON.stringify(sampleAbi) } });

      expect(screen.getByText("Detected Functions (2)")).toBeInTheDocument();
      expect(screen.getByText("transfer")).toBeInTheDocument();
      expect(screen.getByText("balanceOf")).toBeInTheDocument();
    });

    it("does not show preview for invalid JSON", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Interface/ })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /New Interface/ }));

      const textarea = screen.getByPlaceholderText(/{"type":"function"/);
      fireEvent.change(textarea, { target: { value: "not json }}}}}" } });

      expect(screen.queryByText("Detected Functions")).toBeNull();
    });

    it("does not show preview for empty ABI", async () => {
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Interface/ })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /New Interface/ }));

      expect(screen.queryByText("Detected Functions")).toBeNull();
    });
  });

  describe("Decode modal", () => {
    it("opens decode modal via play button", async () => {
      mockApiFetch.mockResolvedValue({ data: [iface], total: 1 });
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
      });

      fireEvent.click(getActionButtons()[0]); // Play button

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Decode Transaction" })).toBeInTheDocument();
      });
    });

    it("validates calldata is required", async () => {
      mockApiFetch.mockResolvedValue({ data: [iface], total: 1 });
      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
      });

      fireEvent.click(getActionButtons()[0]);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Decode Transaction" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Decode" }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Calldata required", "error");
      });
    });

    it("decodes transaction and shows result", async () => {
      const user = userEvent.setup();
      const decodeResult = {
        functionName: "transfer",
        signature: "transfer(address,uint256)",
        selector: "0xa9059cbb",
        args: {
          recipient: "0x414141",
          amount: "1000000",
        },
      };

      let call = 0;
      mockApiFetch.mockImplementation(() => {
        call++;
        if (call <= 4) return Promise.resolve({ data: [iface], total: 1 });
        return Promise.resolve(decodeResult);
      });

      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
      });

      fireEvent.click(getActionButtons()[0]);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Decode Transaction" })).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText("0xa9059cbb000000...");
      await user.type(textarea, "0xa9059cbb000000");

      fireEvent.click(screen.getByRole("button", { name: "Decode" }));

      await waitFor(() => {
        expect(screen.getByText("transfer")).toBeInTheDocument();
        expect(screen.getByText("transfer(address,uint256)")).toBeInTheDocument();
        expect(screen.getByText("0xa9059cbb")).toBeInTheDocument();
        expect(screen.getByText("1000000")).toBeInTheDocument();
      });
    });
  });

  describe("Error handling", () => {
    it("shows toast on fetch error", async () => {
      mockApiFetch.mockRejectedValue(new Error("Network error"));
      render(<ContractInterfacesPage />);
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
        return Promise.reject(new Error("Server error"));
      });

      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /New Interface/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /New Interface/ }));

      await user.type(screen.getByPlaceholderText("e.g. USDC (ERC-20)"), "Test");
      fireEvent.click(screen.getByRole("button", { name: "Create Interface" }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Server error", "error");
      });
    });

    it("shows toast on decode error", async () => {
      const user = userEvent.setup();
      let call = 0;
      mockApiFetch.mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve({ data: [iface], total: 1 });
        return Promise.reject(new Error("Decode failed"));
      });

      render(<ContractInterfacesPage />);
      await waitFor(() => {
        expect(screen.getByText("USDC Token")).toBeInTheDocument();
      });

      fireEvent.click(getActionButtons()[0]);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Decode Transaction" })).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText("0xa9059cbb000000...");
      await user.type(textarea, "0xdeadbeef");
      fireEvent.click(screen.getByRole("button", { name: "Decode" }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith("Decode failed", "error");
      });
    });
  });
});
