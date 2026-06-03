import type { ReactNode } from "react";
import styles from "./StatCard.module.css";

/** Responsive auto-fill grid for a row of StatCards. */
export function StatGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${styles.grid} ${className}`}>{children}</div>;
}

/** Headline metric: big tabular-nums value with a label and optional subtext. */
export function StatCard({
  value,
  label,
  sub,
}: {
  value: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.value}>{value}</div>
      <div className={styles.label}>{label}</div>
      {sub != null && <div className={styles.sub}>{sub}</div>}
    </div>
  );
}
