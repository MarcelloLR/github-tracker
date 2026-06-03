import styles from "./MetricCards.module.css";

export interface MetricItem {
  label: string;
  value: string;
  sub?: string;
}

/** Responsive grid of headline metric tiles. Presentational only. */
export default function MetricCards({ items }: { items: MetricItem[] }) {
  return (
    <div className={styles.grid}>
      {items.map((m) => (
        <div key={m.label} className={styles.card}>
          <div className={styles.value}>{m.value}</div>
          <div className={styles.label}>{m.label}</div>
          {m.sub && <div className={styles.sub}>{m.sub}</div>}
        </div>
      ))}
    </div>
  );
}
