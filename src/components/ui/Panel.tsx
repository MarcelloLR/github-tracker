import type { ReactNode } from "react";
import styles from "./Panel.module.css";

/**
 * Titled "insight panel": a bordered card with an optional header row
 * (title/description on the left, actions/tabs on the right) above a padded
 * body. The workhorse block for the dashboard and detail pages.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
  noBodyPadding = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noBodyPadding?: boolean;
}) {
  const hasHeader = title != null || actions != null;
  return (
    <section className={`${styles.panel} ${className}`}>
      {hasHeader && (
        <header className={styles.header}>
          <div className={styles.headings}>
            {title != null && <h2 className={styles.title}>{title}</h2>}
            {description != null && (
              <p className={styles.description}>{description}</p>
            )}
          </div>
          {actions != null && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div
        className={`${noBodyPadding ? "" : styles.body} ${bodyClassName}`.trim()}
      >
        {children}
      </div>
    </section>
  );
}
