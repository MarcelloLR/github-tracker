import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

// Public, unauthenticated portfolio export. Only renders when the owner has
// opted in (UserSettings.portfolioPublic).
export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const settings = await prisma.userSettings.findUnique({ where: { publicSlug: slug } });
  if (!settings || !settings.portfolioPublic) notFound();

  return (
    <main className="container">
      <h1>Portfolio</h1>
      <p>Public contribution summary will render here. (Scaffold.)</p>
    </main>
  );
}
