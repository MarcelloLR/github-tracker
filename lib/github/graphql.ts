import { graphql } from "@octokit/graphql";

/** A GraphQL client bound to a user's (decrypted) GitHub token. */
export function githubGraphql(token: string) {
  return graphql.defaults({ headers: { authorization: `token ${token}` } });
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
