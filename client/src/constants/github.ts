import type { MatchOptions, MatchProfile } from "@shared/validation/github";
import {
  CONTRIBUTION_TYPES,
  FALLBACK_LABELS,
} from "@shared/validation/github";

export {
  CONTRIBUTION_TYPES,
  FALLBACK_LABELS,
};

export type { MatchOptions, MatchProfile };

export const DEFAULT_PROFILE: MatchProfile = {
  userSkills: [],
  userLanguages: [],
  userFrameworks: [],
  userDomains: [],
  preferredContributionTypes: ["documentation", "bug", "tests"],
};

export const DEFAULT_OPTIONS: MatchOptions = {
  maxResults: 20,
  includeForks: false,
  minStars: 0,
  maxStars: 5000,
  preferredLabels: [...FALLBACK_LABELS],
};

export const SAMPLE_BEGINNER_PROFILE: MatchProfile = {
  userSkills: ["javascript", "react", "css", "html"],
  userLanguages: ["TypeScript", "JavaScript"],
  userFrameworks: ["React", "Next.js"],
  userDomains: ["frontend", "documentation", "ui"],
  preferredContributionTypes: ["documentation", "bug", "tests"],
};

export const GITHUB_SKILL_SUGGESTIONS = [
  // Languages
  "javascript",
  "typescript",
  "python",
  "go",
  "rust",
  "java",
  "kotlin",
  "swift",
  "ruby",
  "php",
  "c++",
  "c#",
  "elixir",
  "dart",
  "scala",
  "lua",
  // Frontend
  "react",
  "next.js",
  "vue",
  "nuxt",
  "svelte",
  "sveltekit",
  "solid",
  "angular",
  "astro",
  "remix",
  "tailwindcss",
  "css",
  "html",
  "sass",
  "htmx",
  "alpine.js",
  "shadcn/ui",
  "radix",
  "lucide",
  // Backend / runtime
  "node.js",
  "bun",
  "deno",
  "express",
  "fastify",
  "hono",
  "nestjs",
  "fastapi",
  "django",
  "flask",
  "rails",
  "spring",
  "laravel",
  "phoenix",
  "effect",
  // Data layer
  "prisma",
  "drizzle",
  "supabase",
  "graphql",
  "trpc",
  "tanstack",
  "rest",
  "grpc",
  "postgresql",
  "mysql",
  "sqlite",
  "mongodb",
  "redis",
  "elasticsearch",
  "zod",
  // Testing
  "jest",
  "vitest",
  "playwright",
  "cypress",
  "pytest",
  "storybook",
  // DevOps / tooling
  "docker",
  "kubernetes",
  "terraform",
  "github actions",
  "ci/cd",
  "vite",
  "webpack",
  "rollup",
  "esbuild",
  "biome",
  "oxc",
  "turborepo",
  "monorepo",
  // AI / LLM / ML
  "langchain",
  "langgraph",
  "llamaindex",
  "openai",
  "anthropic",
  "gemini",
  "huggingface",
  "pytorch",
  "tensorflow",
  "transformers",
  "rag",
  "embeddings",
  "vector-db",
  "pinecone",
  "chroma",
  "mcp",
  "ai-agents",
  "prompt-engineering",
  "ollama",
  "vllm",
  "llm",
  "generative-ai",
  // Domains (cross-listed for discoverability)
  "machine-learning",
  "data-science",
  "webassembly",
  "blockchain",
  "game-dev",
];

export const GITHUB_LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "Kotlin",
  "Swift",
  "C#",
  "C++",
  "PHP",
  "Ruby",
  "Elixir",
  "Dart",
  "Shell",
  "Scala",
  "Lua",
  "R",
];

export const GITHUB_FRAMEWORKS = [
  "React",
  "Next.js",
  "Vue",
  "Nuxt",
  "Svelte",
  "SvelteKit",
  "Astro",
  "Remix",
  "Angular",
  "Solid",
  "Node.js",
  "Express",
  "Fastify",
  "Hono",
  "NestJS",
  "FastAPI",
  "Django",
  "Flask",
  "Rails",
  "Laravel",
  "Spring",
  "Phoenix",
  "Flutter",
  "React Native",
  "Expo",
  "Tauri",
  "Electron",
  "Tailwind CSS",
  "Prisma",
  "Drizzle",
  "Supabase",
];

export const GITHUB_DOMAINS = [
  "frontend",
  "backend",
  "api",
  "cli",
  "devtools",
  "documentation",
  "testing",
  "accessibility",
  "security",
  "performance",
  "ui",
  "ux",
  "design-system",
  "database",
  "mobile",
  "desktop",
  "machine-learning",
  "ai",
  "data-science",
  "infra",
  "cloud",
  "webassembly",
  "blockchain",
  "game-dev",
  "education",
];

/**
 * Combined, de-duplicated tech list for the unified "Skills & tech" picker.
 * Unions skills + languages + frameworks so the user picks from ONE list while
 * the matcher still receives entries routed to the right backing array (see
 * `techCategoryFor` in GithubAnalyser). Kept in sync with the three source
 * arrays above — editing those will automatically flow through here.
 */
export const GITHUB_TECH: string[] = dedupCaseInsensitive([
  ...GITHUB_SKILL_SUGGESTIONS,
  ...GITHUB_LANGUAGES,
  ...GITHUB_FRAMEWORKS,
]);

/**
 * Case-insensitive de-duplication that preserves the first-seen casing. Used to
 * merge the skills/languages/frameworks source lists without "react" + "React"
 * both appearing in the picker.
 */
function dedupCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const DIFFICULTY_PILL_CLASS: Record<"easy" | "medium" | "hard", string> = {
  easy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  hard: "border-red-500/40 bg-red-500/10 text-red-300",
};

export const SCORE_TIER: Array<{ min: number; label: string; className: string }> = [
  { min: 80, label: "Strong match", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  { min: 65, label: "Solid match", className: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  { min: 45, label: "Possible", className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  { min: 0, label: "Weak", className: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400" },
];

export function tierForScore(score: number): (typeof SCORE_TIER)[number] {
  return SCORE_TIER.find((tier) => score >= tier.min) ?? SCORE_TIER[SCORE_TIER.length - 1];
}
