import "./globals.css";
import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ReactNode } from "react";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenClaw Mission Control",
  description: "Operational dashboard for tasks, flows, webhooks, and memory health.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const fontVariables = `${dmSans.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`;

  return (
    <html lang="en" className={fontVariables}>
      <body className={`${fontVariables} ${dmSans.className}`}>{children}</body>
    </html>
  );
}
