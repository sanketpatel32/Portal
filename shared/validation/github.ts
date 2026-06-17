import { z } from "zod";

const nonEmptyString = z.string().trim().min(1).max(64);
const tagList = z.array(nonEmptyString).max(50);

export const CONTRIBUTION_TYPES = [
  "documentation",
  "bug",
  "tests",
  "feature",
  "refactor",
  "design",
  "translation",
  "accessibility",
  "performance",
  "ci-cd",
] as const;

export const FALLBACK_LABELS = [
  "good first issue",
  "help wanted",
  "beginner friendly",
  "first-timers-only",
  "documentation",
  "bug",
  "tests",
] as const;

export const matchProfileSchema = z.object({
  userSkills: tagList,
  userLanguages: tagList,
  userFrameworks: tagList,
  userDomains: tagList,
  preferredContributionTypes: z.array(z.enum(CONTRIBUTION_TYPES)).max(20),
});

export type MatchProfile = z.infer<typeof matchProfileSchema>;

export const matchOptionsSchema = z.object({
  maxResults: z.coerce.number().int().min(5).max(50).default(20),
  includeForks: z.coerce.boolean().default(false),
  minStars: z.coerce.number().int().min(0).max(5000).default(0),
  maxStars: z.coerce.number().int().min(0).max(100_000).default(5000),
  preferredLabels: z.array(z.string().trim().min(1).max(64)).max(20).default([...FALLBACK_LABELS]),
});

export type MatchOptions = z.infer<typeof matchOptionsSchema>;

export const matchRequestSchema = z.object({
  profile: matchProfileSchema,
  options: matchOptionsSchema.optional(),
});

export type MatchRequest = z.infer<typeof matchRequestSchema>;

export const matchedIssueSchema = z.object({
  rank: z.number().int().min(1),
  finalScore: z.number().min(0).max(100),
  difficulty: z.enum(["easy", "medium", "hard"]),
  estimatedTime: z.string(),
  firstAction: z.string(),
  suggestedComment: z.string(),
  reasonForRecommendation: z.string(),
  issueTitle: z.string(),
  issueUrl: z.string(),
  issueNumber: z.number().int(),
  issueBody: z.string(),
  issueCreatedAt: z.string(),
  issueUpdatedAt: z.string(),
  commentCount: z.number().int().min(0),
  labels: z.array(z.string()),
  repositoryName: z.string(),
  repositoryUrl: z.string(),
  language: z.string().nullable(),
  stars: z.number().int().min(0),
  forks: z.number().int().min(0),
  openIssues: z.number().int().min(0),
  lastCommitAt: z.string().nullable(),
  scores: z.object({
    skillMatch: z.number().min(0).max(100),
    beginner: z.number().min(0).max(100),
    repoHealth: z.number().min(0).max(100),
    clarity: z.number().min(0).max(100),
    contributionChance: z.number().min(0).max(100),
  }),
});

export type MatchedIssue = z.infer<typeof matchedIssueSchema>;

export const matchResponseSchema = z.object({
  ok: z.literal(true),
  generatedAt: z.string(),
  durationMs: z.number().int().min(0),
  candidateCount: z.number().int().min(0),
  issues: z.array(matchedIssueSchema),
  warnings: z.array(z.string()),
});

export type MatchResponse = z.infer<typeof matchResponseSchema>;
