"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

export async function createGoal(input: {
  metric: "PRS" | "REVIEWS" | "ISSUES" | "COMMITS";
  period: "WEEKLY" | "MONTHLY";
  target: number;
}): Promise<void> {
  const userId = await requireUserId();
  await prisma.goal.create({ data: { userId, ...input } });
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
}

export async function togglePortfolio(makePublic: boolean): Promise<void> {
  const userId = await requireUserId();
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, portfolioPublic: makePublic },
    update: { portfolioPublic: makePublic },
  });
}
