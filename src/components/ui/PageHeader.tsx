import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

/** Page title row with optional description and right-aligned actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headings}>
        <h1 className={styles.title}>{title}</h1>
        {description != null && (
          <p className={styles.description}>{description}</p>
        )}
      </div>
      {actions != null && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
