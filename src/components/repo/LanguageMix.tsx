import { languageColor } from "@/lib/chart";
import styles from "./LanguageMix.module.css";

export interface LanguageDatum {
  language: string;
  bytes: number;
}

/**
 * Byte-weighted language mix as a single stacked bar + legend. Presentational
 * only — server passes already-summed bytes per language. Colors come from the
 * shared LANGUAGE_COLORS palette (via languageColor).
 */
export default function LanguageMix({ languages }: { languages: LanguageDatum[] }) {
  const total = languages.reduce((a, l) => a + l.bytes, 0);
  if (total <= 0 || languages.length === 0) {
    return <p className={styles.empty}>No language data yet.</p>;
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
              style={{ width: `${pct}%`, background: languageColor(i) }}
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
                style={{ background: languageColor(i) }}
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
