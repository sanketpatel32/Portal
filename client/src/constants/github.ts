export type GithubRepoResult = {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  pushed_at: string;
  topics?: string[];
};

export type GithubSearchSort = "help-wanted-issues" | "stars" | "updated" | "forks";
export type GithubIssueSignal = "help-wanted" | "good-first" | "both" | "any-open";

export const githubFrameworkOptions = [
  { value: "react", label: "React" },
  { value: "nextjs", label: "Next.js" },
  { value: "vue", label: "Vue" },
  { value: "nuxt", label: "Nuxt" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte" },
  { value: "astro", label: "Astro" },
  { value: "remix", label: "Remix" },
  { value: "nodejs", label: "Node.js" },
  { value: "express", label: "Express" },
  { value: "fastapi", label: "FastAPI" },
  { value: "django", label: "Django" },
  { value: "flask", label: "Flask" },
  { value: "rails", label: "Ruby on Rails" },
  { value: "spring", label: "Spring" },
  { value: "laravel", label: "Laravel" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "flutter", label: "Flutter" },
  { value: "react-native", label: "React Native" },
  { value: "electron", label: "Electron" },
  { value: "tauri", label: "Tauri" },
];

export const githubLanguageOptions = [
  "Any language",
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "Go",
  "Rust",
  "C#",
  "C++",
  "PHP",
  "Ruby",
  "Swift",
  "Kotlin",
  "Dart",
  "Elixir",
  "Shell",
  "HTML",
  "CSS",
];

export const githubTopicOptions = [
  { value: "", label: "Any topic" },
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "api", label: "API" },
  { value: "database", label: "Database" },
  { value: "devtools", label: "Developer tools" },
  { value: "testing", label: "Testing" },
  { value: "documentation", label: "Documentation" },
  { value: "accessibility", label: "Accessibility" },
  { value: "security", label: "Security" },
  { value: "machine-learning", label: "Machine learning" },
  { value: "cloud-native", label: "Cloud native" },
  { value: "web-components", label: "Web components" },
  { value: "cli", label: "CLI" },
];

export const githubStarOptions = [0, 10, 50, 100, 500, 1000, 5000];
export const githubResultsPerPage = 4;

export const githubRecencyOptions = [
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 180, label: "Last 6 months" },
  { value: 365, label: "Last 12 months" },
  { value: 730, label: "Last 2 years" },
  { value: 0, label: "Any time" },
];

export const getIsoDateDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};
