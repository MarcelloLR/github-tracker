export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  return (
    <main>
      <h1>{login}</h1>
      <p>
        Your contributions aggregated across this organization&rsquo;s repos, with a
        per-repo breakdown and language mix. (Scaffold.)
      </p>
    </main>
  );
}
