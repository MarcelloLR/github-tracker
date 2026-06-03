import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="container">
      <nav>
        <a href="/dashboard">Dashboard</a> · <a href="/repos">Repos</a> ·{" "}
        <a href="/profile">Profile</a> · <a href="/settings">Settings</a>
      </nav>
      {children}
    </div>
  );
}
