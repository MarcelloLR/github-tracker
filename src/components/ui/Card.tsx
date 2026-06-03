import type { HTMLAttributes } from "react";
import styles from "./Card.module.css";

/** Bordered surface — the base building block for panels and cards. */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.card} ${className}`} {...rest} />;
}
