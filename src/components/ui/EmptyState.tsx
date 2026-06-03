import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

/** Dashed-border centered placeholder for "no data" states. */
export function EmptyState({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${styles.empty} ${className}`.trim()}>{children}</div>;
}
