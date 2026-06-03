import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/nav/Sidebar";
import styles from "./shell.module.css";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className={styles.shell}>
      <Sidebar
        name={session.user.name}
        email={session.user.email}
        image={session.user.image}
      />
      <div className={styles.main}>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
