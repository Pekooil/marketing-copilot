import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { serverEnvironment } from "@/lib/env/server";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI Marketing Copilot",
    template: "%s · AI Marketing Copilot",
  },
  description:
    "An evidence-backed growth operating system for technical founders.",
  metadataBase: new URL(serverEnvironment.NEXT_PUBLIC_APP_URL),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f5f0",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
