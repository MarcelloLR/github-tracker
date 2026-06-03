import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Github Tracker",
  description: "Detailed statistics and AI summaries of your open-source contributions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
