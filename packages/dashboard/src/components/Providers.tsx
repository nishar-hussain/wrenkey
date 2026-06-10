"use client";

import { WranKeyProvider } from "@wrankey/sdk/react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

export function Providers({ children }: { children: React.ReactNode }) {
  return <WranKeyProvider config={{ apiBase }}>{children}</WranKeyProvider>;
}
