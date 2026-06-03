import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.module.css";

type Tone = "neutral" | "accent" | "success" | "warn" | "danger";

/** Small uppercase tag (e.g. a language label or "PRIVATE"). */
export function Badge({
  children,
  tone = "neutral",
  className = "",
  ...rest
}: { children: ReactNode; tone?: Tone } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`${styles.badge} ${styles[tone]} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}

/** Rounded outlined pill (e.g. a repo topic tag). */
export function Pill({
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`${styles.pill} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
