import { Octokit } from "@octokit/rest";

/** A REST client bound to a user's (decrypted) GitHub token. */
export function githubRest(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Fetch the full recursive git tree for a repo at `sha` in one REST call.
 * Use ETags (If-None-Match) when re-fetching so unchanged trees return 304 and
 * do not count against the rate limit. See docs/SPEC.md.
 */
export async function fetchTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
) {
  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: sha,
    recursive: "1",
  });
  return data.tree; // [{ path, type, size, sha }]
}
