import type { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata = {
  title: "Github Tracker",
  description: "Detailed statistics and AI summaries of your open-source contributions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Global toast surface for client-side errors (see lib/api/fetchJson). */}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
