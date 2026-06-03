import Link from "next/link";
import { EmptyState } from "@/components/ui";
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
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <ul className={styles.topList}>
      {items.map((it) => (
        <li key={it.key} className={styles.topRow}>
          <Link href={it.href} className={styles.topLink}>
            <span className={styles.rowMain}>
              <span className={styles.rowName}>{it.name}</span>
              {it.sub ? <span className={styles.rowSub}>{it.sub}</span> : null}
            </span>
            <span className={`${styles.rowCount} tnum`}>
              {it.count.toLocaleString("en-US")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
