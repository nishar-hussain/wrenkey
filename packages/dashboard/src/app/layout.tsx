import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "ArKey - Wallet & Agent Platform",
  description: "AI-Native Wallet & Agent Platform on Arc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
