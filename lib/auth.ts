import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// TODO: wrap the adapter's linkAccount/createUser to encrypt Account.access_token
// at rest via lib/crypto.encrypt, and decrypt only when building GitHub clients
// in the worker. See docs/SPEC.md "OAuth token secrecy".
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    GitHub({
      // Minimal scopes: identity + public-repo contribution data.
      authorization: { params: { scope: "read:user user:email public_repo" } },
    }),
  ],
});
