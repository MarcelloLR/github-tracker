import styles from "./dashboard.module.css";

/** Active-streak display (current + longest consecutive active days). */
export default function Streaks({
  current,
  longest,
}: {
  current: number;
  longest: number;
}) {
  const dayWord = (n: number) => (n === 1 ? "day" : "days");
  return (
    <div className={styles.statRow}>
      <div className={styles.bigStat}>
        <span className={`${styles.bigStatValue} tnum`}>
          {current} {dayWord(current)}
        </span>
        <span className={styles.bigStatLabel}>Current streak</span>
      </div>
      <div className={styles.bigStat}>
        <span className={`${styles.bigStatValue} tnum`}>
          {longest} {dayWord(longest)}
        </span>
        <span className={styles.bigStatLabel}>Longest streak</span>
      </div>
    </div>
  );
}
