import { prisma } from "@/lib/db";

const FLOOR = Number(process.env.GITHUB_RATE_FLOOR ?? "200");

export interface RateLimitInfo {
  cost: number;
  remaining: number;
  resetAt: Date;
}

/** Persist the latest rate-limit reading for a user (from a GraphQL/REST response). */
export async function recordRateLimit(userId: string, info: RateLimitInfo): Promise<void> {
  await prisma.syncState.update({
    where: { userId },
    data: { rateRemaining: info.remaining, rateResetAt: info.resetAt },
  });
}

/**
 * Milliseconds a job should wait before issuing more GitHub calls (0 = safe now).
 * Callers pair this with `job.moveToDelayed(Date.now() + delay)`.
 */
export async function rateLimitDelayMs(userId: string): Promise<number> {
  const state = await prisma.syncState.findUnique({ where: { userId } });
  if (state?.rateRemaining == null || state.rateResetAt == null) return 0;
  if (state.rateRemaining > FLOOR) return 0;
  return Math.max(0, state.rateResetAt.getTime() - Date.now());
}
