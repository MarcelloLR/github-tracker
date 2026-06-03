import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GoalsForm, type GoalItem } from "@/components/settings/GoalsForm";
import { SyncBudgetForm } from "@/components/settings/SyncBudgetForm";
import { PortfolioForm } from "@/components/settings/PortfolioForm";

// Defaults mirror prisma/schema.prisma so the UI is sensible before a
// UserSettings row exists (it is created on first write).
const DEFAULT_SYNC_INTERVAL_HRS = 3;
const DEFAULT_DEEP_DIVE_BUDGET = 5;

export default async function SettingsPage() {
  // The (app) layout already gates on auth; this is a belt-and-suspenders scope.
  const session = await auth();
  const userId = session!.user.id;

  const [settings, goals] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.goal.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, metric: true, period: true, target: true },
    }),
  ]);

  return (
    <main>
      <h1>Settings</h1>

      <GoalsForm goals={goals as GoalItem[]} />

      <SyncBudgetForm
        syncIntervalHrs={settings?.syncIntervalHrs ?? DEFAULT_SYNC_INTERVAL_HRS}
        deepDiveBudget={settings?.deepDiveBudget ?? DEFAULT_DEEP_DIVE_BUDGET}
      />

      <PortfolioForm
        portfolioPublic={settings?.portfolioPublic ?? false}
        publicSlug={settings?.publicSlug ?? null}
      />
    </main>
  );
}
