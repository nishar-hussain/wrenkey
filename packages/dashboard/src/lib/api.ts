export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

export interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, ...fetchOpts } = options;
  const headers: Record<string, string> = {
    ...((fetchOpts.headers as Record<string, string>) || {}),
  };

  if (fetchOpts.body) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, {
      ...fetchOpts,
      headers,
    });
  } catch (err: any) {
    throw new Error(`Cannot reach server at ${API_BASE}. Is the backend running?`);
  }

  if (!res.ok) {
    if (res.status === 401) {
      // Don't redirect if we're already on a public/auth page
      const isAuthPath = path.startsWith("/auth/");
      const isOnLoginPage = typeof window !== "undefined" && window.location.pathname.startsWith("/login");
      if (typeof window !== "undefined" && !isAuthPath && !isOnLoginPage) {
        localStorage.removeItem("wrankey_token");
        localStorage.removeItem("wrankey_user");
        localStorage.removeItem("wrankey_org");
        localStorage.removeItem("wrankey_remembered_user");
        if (process.env.NODE_ENV !== "test") {
          window.location.href = "/login";
        }
      }
    }
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export function getApiBase(): string {
  return API_BASE;
}
