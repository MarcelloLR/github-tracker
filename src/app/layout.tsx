import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/*
 * Geist (sans + mono) is Vercel's typeface — the core of the Geist aesthetic.
 * next/font self-hosts the files at build time and exposes them as CSS
 * variables that globals.css consumes via var(--font-sans) / var(--font-mono).
 */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Github Tracker",
  description:
    "Detailed statistics and AI summaries of your open-source contributions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        {/* Global toast surface for client-side errors (see lib/api/fetchJson). */}
        <Toaster theme="dark" richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
