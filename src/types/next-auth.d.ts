import type { DefaultSession } from "next-auth";

// Expose the database user id on the session so server code can scope queries.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
