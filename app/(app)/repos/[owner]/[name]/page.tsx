export default async function RepoDetailPage({
  params,
}: {
  params: Promise<{ owner: string; name: string }>;
}) {
  const { owner, name } = await params;
  return (
    <main>
      <h1>
        {owner}/{name}
      </h1>
      <p>
        Metrics, contribution timeline, language mix, the AI metadata summary, and a
        &ldquo;Deep dive&rdquo; action will render here. (Scaffold.)
      </p>
    </main>
  );
}
