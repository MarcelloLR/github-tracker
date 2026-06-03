"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

// Turn arbitrary text into a URL-safe slug for /p/[slug]. Lowercase, ASCII
// alphanumerics + single dashes, trimmed, capped to a sane length.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

// Pick a slug not already taken (excluding the current user's own row).
async function uniqueSlug(base: string, userId: string): Promise<string> {
  const root = slugify(base) || "user";
  let candidate = root;
  for (let i = 0; i < 50; i++) {
    const existing = await prisma.userSettings.findUnique({
      where: { publicSlug: candidate },
      select: { userId: true },
    });
    if (!existing || existing.userId === userId) return candidate;
    candidate = `${root}-${i + 2}`;
  }
  // Extremely unlikely fallback: suffix with a random token.
  return `${root}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function updateSettings(input: {
  syncIntervalHrs?: number;
  deepDiveBudget?: number;
}): Promise<void> {
  const userId = await requireUserId();
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
  revalidatePath("/settings");
}

export async function togglePortfolio(makePublic: boolean): Promise<void> {
  const userId = await requireUserId();
  const current = await prisma.userSettings.findUnique({ where: { userId } });

  // When turning the portfolio public, make sure a publicSlug exists so the
  // /p/[slug] route is reachable. Derive it from the user's GitHub login.
  let publicSlug = current?.publicSlug ?? null;
  if (makePublic && !publicSlug) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { login: true, name: true },
    });
    publicSlug = await uniqueSlug(user?.login || user?.name || "user", userId);
  }

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, portfolioPublic: makePublic, publicSlug },
    update: { portfolioPublic: makePublic, ...(publicSlug ? { publicSlug } : {}) },
  });
  revalidatePath("/settings");
}

export async function updatePublicSlug(slug: string): Promise<{ slug: string }> {
  const userId = await requireUserId();
  const resolved = await uniqueSlug(slug, userId);
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, publicSlug: resolved },
    update: { publicSlug: resolved },
  });
  revalidatePath("/settings");
  return { slug: resolved };
}
