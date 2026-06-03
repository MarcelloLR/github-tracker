import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount } from "@auth/core/adapters";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

// OAuth token secrecy (docs/SPEC.md "OAuth token secrecy"):
// GitHub OAuth tokens are AES-256-GCM encrypted at rest. The contract is
// encrypt-on-write / decrypt-on-read:
//   - write: `linkAccount` below encrypts access_token/refresh_token/id_token
//     with lib/crypto.encrypt before they are persisted to Account.
//   - read: only the worker/auth layer decrypts (lib/crypto.decrypt) when
//     building GitHub clients; ciphertext never reaches the client or logs.
// The stored value is exactly lib/crypto.encrypt's "iv.tag.ciphertext" format.

/**
 * Wrap PrismaAdapter so the GitHub OAuth tokens are encrypted before storage.
 * Everything else delegates to the base adapter unchanged.
 */
function encryptedAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    linkAccount(account: AdapterAccount) {
      const enc: AdapterAccount = {
        ...account,
        ...(account.access_token
          ? { access_token: encrypt(account.access_token) }
          : {}),
        ...(account.refresh_token
          ? { refresh_token: encrypt(account.refresh_token) }
          : {}),
        ...(account.id_token
          ? { id_token: encrypt(account.id_token) }
          : {}),
      };
      return base.linkAccount!(enc);
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: encryptedAdapter(),
  session: { strategy: "database" },
  providers: [
    GitHub({
      // Minimal scopes: identity + public-repo contribution data.
      authorization: { params: { scope: "read:user user:email public_repo" } },
    }),
  ],
  callbacks: {
    // Database sessions: surface the DB user id so server code can scope queries
    // (app/actions, app/(app)/layout.tsx, API routes all rely on session.user.id).
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
