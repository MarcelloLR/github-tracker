import Link from "next/link";
import styles from "./dashboard.module.css";

export interface TopItem {
  key: string;
  name: string;
  sub?: string;
  count: number;
  href: string;
}

/** Ranked "top repos"/"top orgs" list with links into detail pages. */
export default function TopList({
  items,
  emptyLabel,
}: {
  items: TopItem[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <div className={styles.empty}>{emptyLabel}</div>;
  }

  return (
    <div className={styles.card}>
      {items.map((it) => (
        <div key={it.key} className={styles.cardRow}>
          <div className={styles.rowMain}>
            <div className={styles.rowName}>
              <Link href={it.href}>{it.name}</Link>
            </div>
            {it.sub ? <div className={styles.rowSub}>{it.sub}</div> : null}
          </div>
          <div className={styles.rowCount}>
            {it.count.toLocaleString("en-US")}
          </div>
        </div>
      ))}
    </div>
  );
}
