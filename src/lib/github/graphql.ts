import { graphql } from "@octokit/graphql";
import { recordRateLimit, type RateLimitInfo } from "@/lib/github/rateLimit";

/** A GraphQL client bound to a user's (decrypted) GitHub token. */
export function githubGraphql(token: string) {
  return graphql.defaults({ headers: { authorization: `token ${token}` } });
}

/** The graphql client returned by {@link githubGraphql}. */
export type GithubGraphql = ReturnType<typeof githubGraphql>;

// ---------------------------------------------------------------------------
// Shared rate-limit plumbing
// ---------------------------------------------------------------------------

interface RawRateLimit {
  cost: number;
  remaining: number;
  resetAt: string;
}

/** Every query selects this shape; we parse + persist it via recordRateLimit. */
function parseRateLimit(raw: RawRateLimit | null | undefined): RateLimitInfo | null {
  if (!raw) return null;
  return {
    cost: raw.cost,
    remaining: raw.remaining,
    resetAt: new Date(raw.resetAt),
  };
}

/** Run a query, persist its rateLimit reading for `userId`, return the result. */
async function runWithRateLimit<T extends { rateLimit?: RawRateLimit | null }>(
  client: GithubGraphql,
  userId: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const result = await client<T>(query, variables);
  const info = parseRateLimit(result.rateLimit);
  if (info) {
    // SyncState row may not exist yet on a brand-new user; recordRateLimit uses
    // update(), so swallow the (rare) race rather than fail the whole job.
    await recordRateLimit(userId, info).catch(() => {});
  }
  return result;
}

// Always request `rateLimit { cost remaining resetAt }` so callers can feed
// lib/github/rateLimit.recordRateLimit. This single query covers repo/org
// discovery + per-repo contribution counts + the daily contribution calendar.
export const CONTRIBUTIONS_QUERY = /* GraphQL */ `
  query Contributions($login: String!, $from: DateTime!, $to: DateTime!) {
    rateLimit { cost remaining resetAt }
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
        commitContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
          contributions { totalCount }
        }
        pullRequestContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
          contributions { totalCount }
        }
        pullRequestReviewContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
          contributions { totalCount }
        }
        issueContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
          contributions { totalCount }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface RepoRef {
  nameWithOwner: string;
}

export interface ContributionsByRepository {
  repository: RepoRef;
  contributions: { totalCount: number };
}

export interface ContributionsResult {
  rateLimit?: RawRateLimit | null;
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number;
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
      commitContributionsByRepository: ContributionsByRepository[];
      pullRequestContributionsByRepository: ContributionsByRepository[];
      pullRequestReviewContributionsByRepository: ContributionsByRepository[];
      issueContributionsByRepository: ContributionsByRepository[];
    };
  } | null;
}

/** Run the discovery contributionsCollection query and persist rate limit. */
export async function fetchContributions(
  client: GithubGraphql,
  userId: string,
  vars: { login: string; from: string; to: string },
): Promise<ContributionsResult> {
  return runWithRateLimit<ContributionsResult>(client, userId, CONTRIBUTIONS_QUERY, vars);
}

// ---------------------------------------------------------------------------
// Repository metadata (id / readme / languages / topics / HEAD sha / pushedAt)
// ---------------------------------------------------------------------------

export const REPO_METADATA_QUERY = /* GraphQL */ `
  query RepoMetadata($owner: String!, $name: String!) {
    rateLimit { cost remaining resetAt }
    repository(owner: $owner, name: $name) {
      id
      nameWithOwner
      description
      isPrivate
      stargazerCount
      pushedAt
      primaryLanguage { name }
      licenseInfo { spdxId }
      repositoryTopics(first: 25) { nodes { topic { name } } }
      defaultBranchRef {
        name
        target { ... on Commit { oid } }
      }
      languages(first: 50, orderBy: { field: SIZE, direction: DESC }) {
        edges { size node { name } }
      }
      owner {
        login
        ... on Organization {
          id
          name
          avatarUrl
          description
        }
      }
      object(expression: "HEAD:README.md") {
        ... on Blob { text }
      }
    }
  }
`;

export interface RepoMetadata {
  id: string;
  nameWithOwner: string;
  description: string | null;
  isPrivate: boolean;
  stargazerCount: number;
  pushedAt: string | null;
  primaryLanguage: { name: string } | null;
  licenseInfo: { spdxId: string | null } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  defaultBranchRef: { name: string; target: { oid?: string } | null } | null;
  languages: { edges: { size: number; node: { name: string } }[] };
  owner: {
    login: string;
    // org-only fields (undefined for User owners)
    id?: string;
    name?: string | null;
    avatarUrl?: string | null;
    description?: string | null;
  };
  object: { text?: string } | null;
}

interface RepoMetadataResult {
  rateLimit?: RawRateLimit | null;
  repository: RepoMetadata | null;
}

/** Fetch full repo metadata (owner/name) and persist rate limit. Null if gone. */
export async function fetchRepoMetadata(
  client: GithubGraphql,
  userId: string,
  owner: string,
  name: string,
): Promise<RepoMetadata | null> {
  const result = await runWithRateLimit<RepoMetadataResult>(
    client,
    userId,
    REPO_METADATA_QUERY,
    { owner, name },
  );
  return result.repository;
}

// ---------------------------------------------------------------------------
// PR / issue detail via search(type: ISSUE)
// ---------------------------------------------------------------------------

const ISSUE_SEARCH_FIELDS = /* GraphQL */ `
  pageInfo { hasNextPage endCursor }
  nodes {
    __typename
    ... on PullRequest {
      id
      number
      title
      state
      createdAt
      mergedAt
      closedAt
      additions
      deletions
      reviews { totalCount }
      repository { nameWithOwner }
    }
    ... on Issue {
      id
      number
      title
      state
      createdAt
      closedAt
      repository { nameWithOwner }
    }
  }
`;

// NOTE: the GraphQL variable is `$searchQuery`, NOT `$query`. @octokit/graphql
// reserves `query` (along with `method`, `url`, `headers`, …) as a request
// option, so passing a variable literally named `query` throws
// `"query" cannot be used as variable name` before any request is sent.
export const ISSUE_SEARCH_QUERY = /* GraphQL */ `
  query IssueSearch($searchQuery: String!, $first: Int!, $after: String) {
    rateLimit { cost remaining resetAt }
    search(type: ISSUE, query: $searchQuery, first: $first, after: $after) {
      ${ISSUE_SEARCH_FIELDS}
    }
  }
`;

export interface SearchPrNode {
  __typename: "PullRequest";
  id: string;
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  reviews: { totalCount: number };
  repository: RepoRef;
}

export interface SearchIssueNode {
  __typename: "Issue";
  id: string;
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  createdAt: string;
  closedAt: string | null;
  repository: RepoRef;
}

export type SearchIssueOrPr = SearchPrNode | SearchIssueNode;

interface IssueSearchResult {
  rateLimit?: RawRateLimit | null;
  search: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: (SearchIssueOrPr | Record<string, never>)[];
  };
}

export interface SearchPage<T> {
  nodes: T[];
  hasNextPage: boolean;
  endCursor: string | null;
}

/**
 * Run one page of a `search(type: ISSUE)` query. `query` is the GitHub search
 * string (e.g. `author:LOGIN type:pr repo:owner/name created:>=2024-01-01`).
 */
export async function searchIssues(
  client: GithubGraphql,
  userId: string,
  query: string,
  first = 50,
  after?: string,
): Promise<SearchPage<SearchIssueOrPr>> {
  const result = await runWithRateLimit<IssueSearchResult>(
    client,
    userId,
    ISSUE_SEARCH_QUERY,
    { searchQuery: query, first, after: after ?? null },
  );
  const nodes = (result.search.nodes ?? []).filter(
    (n): n is SearchIssueOrPr =>
      (n as SearchIssueOrPr).__typename === "PullRequest" ||
      (n as SearchIssueOrPr).__typename === "Issue",
  );
  return {
    nodes,
    hasNextPage: result.search.pageInfo.hasNextPage,
    endCursor: result.search.pageInfo.endCursor,
  };
}

// ---------------------------------------------------------------------------
// Commit history via repository.defaultBranchRef.target.history(author:{id})
// ---------------------------------------------------------------------------

export const COMMIT_HISTORY_QUERY = /* GraphQL */ `
  query CommitHistory(
    $owner: String!
    $name: String!
    $authorId: ID!
    $since: GitTimestamp
    $first: Int!
    $after: String
  ) {
    rateLimit { cost remaining resetAt }
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(author: { id: $authorId }, since: $since, first: $first, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes { oid committedDate additions deletions }
            }
          }
        }
      }
    }
  }
`;

export interface CommitNode {
  oid: string;
  committedDate: string;
  additions: number;
  deletions: number;
}

interface CommitHistoryResult {
  rateLimit?: RawRateLimit | null;
  repository: {
    defaultBranchRef: {
      target: {
        history?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: CommitNode[];
        };
      } | null;
    } | null;
  } | null;
}

/**
 * One page of the authenticated user's commit history on a repo's default
 * branch since `since`. `authorId` is the GitHub User node id.
 */
export async function fetchCommitHistory(
  client: GithubGraphql,
  userId: string,
  vars: {
    owner: string;
    name: string;
    authorId: string;
    since?: string | null;
    first?: number;
    after?: string | null;
  },
): Promise<SearchPage<CommitNode>> {
  const result = await runWithRateLimit<CommitHistoryResult>(client, userId, COMMIT_HISTORY_QUERY, {
    owner: vars.owner,
    name: vars.name,
    authorId: vars.authorId,
    since: vars.since ?? null,
    first: vars.first ?? 100,
    after: vars.after ?? null,
  });
  const history = result.repository?.defaultBranchRef?.target?.history;
  if (!history) {
    return { nodes: [], hasNextPage: false, endCursor: null };
  }
  return {
    nodes: history.nodes ?? [],
    hasNextPage: history.pageInfo.hasNextPage,
    endCursor: history.pageInfo.endCursor,
  };
}

// ---------------------------------------------------------------------------
// Viewer identity (login + node id) — needed for search/author queries
// ---------------------------------------------------------------------------

export const VIEWER_QUERY = /* GraphQL */ `
  query Viewer {
    rateLimit { cost remaining resetAt }
    viewer { id login }
  }
`;

interface ViewerResult {
  rateLimit?: RawRateLimit | null;
  viewer: { id: string; login: string };
}

/** Resolve the token owner's GitHub login + node id (for author-scoped queries). */
export async function fetchViewer(
  client: GithubGraphql,
  userId: string,
): Promise<{ id: string; login: string }> {
  const result = await runWithRateLimit<ViewerResult>(client, userId, VIEWER_QUERY, {});
  return result.viewer;
}
