import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * Load a user's GitHub OAuth access token (decrypted) for worker-side API calls.
 *
 * The token is stored on the GitHub `Account` row, encrypted at rest with
 * AES-256-GCM (lib/crypto). For robustness across merge order — the auth tier
 * that wires encryption on `linkAccount` is a separate open TODO — we attempt to
 * decrypt and, if that throws (e.g. the value is still plaintext because
 * encryption has not landed yet), fall back to treating the stored value as the
 * raw token. This keeps the pipeline working regardless of which branch merges
 * first while never logging the token.
 */
export async function getUserToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });

  if (!account) {
    throw new Error(`No GitHub account linked for user ${userId}`);
  }
  if (!account.access_token) {
    throw new Error(`No GitHub access token stored for user ${userId}`);
  }

  try {
    return decrypt(account.access_token);
  } catch {
    // Stored value is not (yet) AES-GCM ciphertext — treat as plaintext.
    return account.access_token;
  }
}
