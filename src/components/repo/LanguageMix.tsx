import styles from "./LanguageMix.module.css";

export interface LanguageDatum {
  language: string;
  bytes: number;
}

// Stable palette keyed by index; languages over this many get an "Other"-ish color.
const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#a3a3a3",
];

/**
 * Byte-weighted language mix as a single stacked bar + legend. Presentational
 * only — server passes already-summed bytes per language.
 */
export default function LanguageMix({ languages }: { languages: LanguageDatum[] }) {
  const total = languages.reduce((a, l) => a + l.bytes, 0);
  if (total <= 0 || languages.length === 0) {
    return (
      <p style={{ opacity: 0.6, fontStyle: "italic" }}>No language data yet.</p>
    );
  }

  const sorted = [...languages].sort((a, b) => b.bytes - a.bytes);

  return (
    <div>
      <div className={styles.bar}>
        {sorted.map((l, i) => {
          const pct = (l.bytes / total) * 100;
          return (
            <div
              key={l.language}
              className={styles.segment}
              style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
              title={`${l.language} ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>
      <ul className={styles.legend}>
        {sorted.map((l, i) => {
          const pct = (l.bytes / total) * 100;
          return (
            <li key={l.language} className={styles.legendItem}>
              <span
                className={styles.swatch}
                style={{ background: COLORS[i % COLORS.length] }}
              />
              {l.language}
              <span className={styles.pct}>{pct.toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
