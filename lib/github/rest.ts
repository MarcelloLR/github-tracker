import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

/** A REST client bound to a user's (decrypted) GitHub token. */
export function githubRest(token: string): Octokit {
  return new Octokit({ auth: token });
}

/** A tree entry as returned by the git trees API. */
export interface TreeEntry {
  path?: string;
  type?: string;
  size?: number;
  sha?: string;
}

/** Result of an ETag-aware fetch: either fresh data + new etag, or "not modified". */
export type ConditionalResult<T> =
  | { notModified: true }
  | { notModified: false; data: T; etag: string | undefined };

/**
 * Fetch the full recursive git tree for a repo at `sha` in one REST call.
 *
 * Pass `etag` (from a previous response) to send `If-None-Match`; when GitHub
 * returns 304 the tree is unchanged and the call does not count against the
 * rate limit — we surface that as `{ notModified: true }`. See docs/SPEC.md.
 */
export async function fetchTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
  etag?: string,
): Promise<ConditionalResult<TreeEntry[]>> {
  try {
    const res = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: sha,
      recursive: "1",
      headers: etag ? { "if-none-match": etag } : undefined,
    });
    return {
      notModified: false,
      data: res.data.tree as TreeEntry[],
      etag: res.headers.etag,
    };
  } catch (err) {
    if (err instanceof RequestError && err.status === 304) {
      return { notModified: true };
    }
    throw err;
  }
}

/**
 * Fetch a single blob by its git SHA and return the decoded UTF-8 content.
 * Used (deep-dive only) to read selected source files. The blob API returns
 * base64-encoded content which we decode here.
 */
export async function fetchBlob(
  octokit: Octokit,
  owner: string,
  repo: string,
  fileSha: string,
): Promise<string> {
  const { data } = await octokit.git.getBlob({ owner, repo, file_sha: fileSha });
  if (data.encoding === "base64") {
    return Buffer.from(data.content, "base64").toString("utf8");
  }
  // GitHub returns base64 in practice; fall back to the raw content otherwise.
  return data.content;
}
