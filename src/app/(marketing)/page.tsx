import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui";
import styles from "./landing.module.css";

export default function LandingPage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>Open-source contribution analytics</span>
        <h1 className={styles.title}>GitHub Tracker</h1>
        <p className={styles.subtitle}>
          Detailed statistics and AI summaries of your open-source contributions
          — per repository and per organization.
        </p>

        <form
          className={styles.form}
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" variant="primary" size="md">
            <svg
              className={styles.ghIcon}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5Z" />
            </svg>
            Sign in with GitHub
          </Button>
        </form>

        <p className={styles.features}>
          Per-repo deep dives · org rollups · profile summaries
        </p>
      </section>
    </main>
  );
}
