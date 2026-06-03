import { signIn } from "@/lib/auth";

export default function LandingPage() {
  return (
    <main className="container">
      <h1>Github Tracker</h1>
      <p>
        Detailed statistics and AI summaries of your open-source contributions —
        per repository and per organization.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/dashboard" });
        }}
      >
        <button type="submit">Sign in with GitHub</button>
      </form>
    </main>
  );
}
