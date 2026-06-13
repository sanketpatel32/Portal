import { useState, useEffect, useRef } from "react";
import { env } from "@/env";
import { AlertCircle, ArrowLeft, ExternalLink, GitFork, Loader2, LogOut, Search, SlidersHorizontal, Star } from "lucide-react";
import { WheelPicker } from "./components/ui/WheelPicker";
import { ExpenseTracker } from "./components/ExpenseTracker";
import { NoSqlClient } from "./components/NoSqlClient";
import { SqlClient } from "./components/SqlClient";
import { PostmanClient } from "./components/PostmanClient";
import { ClockCalendar } from "./components/ClockCalendar";
import { WritingAgent } from "./components/WritingAgent";
import { getBallPairPositions, canvasPointerFromRef } from "./lib/app-physics";
import "./App.css";

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

function createAudioContext(): AudioContext | null {
  const webkit = (window as WindowWithWebkitAudio).webkitAudioContext;
  const Ctx = window.AudioContext ?? webkit;
  return Ctx ? new Ctx() : null;
}

type CanvasContextWithLetterSpacing = CanvasRenderingContext2D & {
  letterSpacing?: string;
};

type AppOneSubappId =
  | "github-issue-analyser"
  | "expense-tracker"
  | "nosql-client"
  | "subapp4"
  | "postman"
  | "writing-agent"
  | "subapp8"
  | "subapp9"
  | "subapp10";

const placeholderSubappIds = new Set<AppOneSubappId>(["subapp8", "subapp9", "subapp10"]);

type GithubRepoResult = {
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

type GithubSearchSort = "help-wanted-issues" | "stars" | "updated" | "forks";
type GithubIssueSignal = "help-wanted" | "good-first" | "both" | "any-open";

const appOneSubapps: Array<{ id: AppOneSubappId; label: string; detail: string }> = [
  {
    id: "github-issue-analyser",
    label: "GitHub Issue Analyser",
    detail: "Find open-source repos with useful contribution signals",
  },
  {
    id: "expense-tracker",
    label: "Expense Tracker",
    detail: "Track spending by category with powerful commands",
  },
  { id: "nosql-client", label: "NoSQL Client", detail: "Browse and edit MongoDB documents" },
  { id: "subapp4", label: "SQL Client", detail: "Read-only SQL for PostgreSQL, MySQL, and SQLite" },
  { id: "postman", label: "Postman", detail: "Fire HTTP requests and inspect responses" },
  { id: "writing-agent", label: "Writing Agent", detail: "Fix grammar and improve writing style with AI" },
  { id: "subapp8", label: "Module 8", detail: "Reserved slot" },
  { id: "subapp9", label: "Module 9", detail: "Reserved slot" },
  { id: "subapp10", label: "Module 10", detail: "Reserved slot" },
];

const getIsoDateDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const githubFrameworkOptions = [
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

const githubLanguageOptions = [
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

const githubTopicOptions = [
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

const githubStarOptions = [0, 10, 50, 100, 500, 1000, 5000];
const githubResultsPerPage = 4;

const githubRecencyOptions = [
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 180, label: "Last 6 months" },
  { value: 365, label: "Last 12 months" },
  { value: 730, label: "Last 2 years" },
  { value: 0, label: "Any time" },
];

// Custom synthesizer for premium feedback sounds (100% web-native)
const playBeep = (type: "success" | "error" | "click") => {
  try {
    const ctx = createAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === "success") {
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.start();
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.28);
    } else if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(90, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.stop(ctx.currentTime + 0.42);
    } else if (type === "click") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.stop(ctx.currentTime + 0.04);
    }
  } catch {
    // Browser blocked AudioContext until user interaction
  }
};

function App() {
  // Auth state
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auraflow_pin_token"));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false); // Handles unlocking animation state
  
  // PIN lock screen state
  const [pinDigits, setPinDigits] = useState<string[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [activeApp, setActiveApp] = useState<number | null>(null);
  const [activeSubapp, setActiveSubapp] = useState<AppOneSubappId | null>(null);
  const activeAppRef = useRef<number | null>(null);
  useEffect(() => {
    activeAppRef.current = activeApp;
  }, [activeApp]);

  // GitHub Issue Analyser state
  const [githubFramework, setGithubFramework] = useState("react");
  const [githubLanguage, setGithubLanguage] = useState("TypeScript");
  const [githubTopic, setGithubTopic] = useState("");
  const [githubMinStars, setGithubMinStars] = useState(100);
  const [githubRecentDays, setGithubRecentDays] = useState(365);
  const [githubIssueSignal, setGithubIssueSignal] = useState<GithubIssueSignal>("help-wanted");
  const [githubIncludeForks, setGithubIncludeForks] = useState(false);
  const [githubSort, setGithubSort] = useState<GithubSearchSort>("help-wanted-issues");
  const [githubResults, setGithubResults] = useState<GithubRepoResult[]>([]);
  const [githubTotalCount, setGithubTotalCount] = useState(0);
  const [githubQuery, setGithubQuery] = useState("");
  const [githubError, setGithubError] = useState<string | null>(null);
  const [isGithubSearching, setIsGithubSearching] = useState(false);
  const [githubPage, setGithubPage] = useState(1);

  // References
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dragStartInfo = useRef({ x: 0, y: 0, time: 0 });

  // Clock & Timer App States
  const [activeTab, setActiveTab] = useState<"clock" | "alarm" | "timer" | "calendar">("clock");
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Timer States
  const [timerDuration, setTimerDuration] = useState(0); // in seconds
  const [timerRemaining, setTimerRemaining] = useState(0); // in seconds
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [timerH, setTimerH] = useState(0);
  const [timerM, setTimerM] = useState(5); // default 5 mins
  const [timerS, setTimerS] = useState(0);
  const [timerAlarm, setTimerAlarm] = useState(false);

  // Alarm States
  const [alarmH, setAlarmH] = useState(7); // default 07:00
  const [alarmM, setAlarmM] = useState(0);
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmTriggered, setAlarmTriggered] = useState(false);
  const lastAlarmChecked = useRef<string | null>(null);

  // Physics state (starts at 0 - static rest until interacted with)
  const physicsState = useRef({
    theta: [0, 0, 0],
    omega: [0, 0, 0],
    draggedIndex: null as number | null,
    targetTheta: 0,
    prevDragTheta: 0,
  });

  // Mouse state tracker
  const mouseState = useRef({
    x: 0,
    y: 0,
    isDown: false,
  });

  // Verify stored token on load
  useEffect(() => {
    const verifyStoredToken = async () => {
      if (!token) {
        setIsAuthenticated(false);
        return;
      }
      
      try {
        setIsVerifying(true);
        const res = await fetch(`${env.VITE_API_URL}/api/verify-token`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        
        if (res.ok) {
          setIsUnlocked(true);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem("auraflow_pin_token");
          setToken(null);
          setIsAuthenticated(false);
        }
      } catch {
        localStorage.removeItem("auraflow_pin_token");
        setToken(null);
        setIsAuthenticated(false);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyStoredToken();
  }, [token]);

  // Open clock + calendar tab after Google OAuth redirect
  useEffect(() => {
    if (!isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get("google");
    if (!googleResult) return;

    queueMicrotask(() => {
      if (googleResult === "connected") {
        playBeep("success");
      } else if (googleResult === "error" || googleResult === "offline") {
        playBeep("error");
      }
      setActiveApp(2);
      setActiveTab("calendar");
    });

    params.delete("google");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [isAuthenticated]);

  // Clock & Timer Intervals
  useEffect(() => {
    if (activeApp !== 2) return;
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // Check alarm trigger
      const h = now.getHours();
      const m = now.getMinutes();
      const timeString = `${h}:${m}`;

      if (alarmActive && !alarmTriggered && timeString !== lastAlarmChecked.current && h === alarmH && m === alarmM) {
        lastAlarmChecked.current = timeString;
        setAlarmTriggered(true);
        playBeep("success");
      }
    }, 200);
    return () => clearInterval(timer);
  }, [activeApp, alarmActive, alarmTriggered, alarmH, alarmM]);

  useEffect(() => {
    if (!isTimerActive || isTimerPaused || activeApp !== 2) return;
    const interval = setInterval(() => {
      setTimerRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsTimerActive(false);
          setTimerAlarm(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerActive, isTimerPaused, activeApp]);

  useEffect(() => {
    if ((!timerAlarm && !alarmTriggered) || activeApp !== 2) return;
    const interval = setInterval(() => {
      playBeep("success");
    }, 1500);
    return () => clearInterval(interval);
  }, [timerAlarm, alarmTriggered, activeApp]);

  // Validate the PIN via server POST API
  const submitPin = async (pinCode: string) => {
    setIsVerifying(true);
    setAuthError(null);
    
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinCode }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        playBeep("success");
        setIsUnlocked(true);
        // Wait for unlocking slide-up animation
        setTimeout(() => {
          setToken(data.token);
          localStorage.setItem("auraflow_pin_token", data.token);
          setIsAuthenticated(true);
        }, 500);
      } else {
        triggerAuthError(data.error || "Authentication failed");
      }
    } catch {
      triggerAuthError("Database / Server Offline");
    } finally {
      setIsVerifying(false);
    }
  };

  const triggerAuthError = (message: string) => {
    playBeep("error");
    setIsShaking(true);
    setAuthError(message);
    setPinDigits([]);
    
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
    
    setTimeout(() => {
      setIsShaking(false);
    }, 450);
  };

  // Log out action
  const handleLogout = () => {
    playBeep("error");
    localStorage.removeItem("auraflow_pin_token");
    setToken(null);
    setIsAuthenticated(false);
    setIsUnlocked(false);
    setPinDigits([]);
    // Reset Timer states
    setIsTimerActive(false);
    setTimerAlarm(false);
    setActiveApp(null);
    setActiveSubapp(null);
  };

  const buildGithubSearchQuery = () => {
    const framework = githubFramework.trim();
    if (!framework) {
      return "";
    }

    const queryParts = [
      `${framework} in:name,description,topics,readme`,
      "is:public",
      "archived:false",
      githubIncludeForks ? "fork:true" : "fork:false",
    ];

    if (githubMinStars > 0) {
      queryParts.push(`stars:>=${githubMinStars}`);
    }

    const language = githubLanguage.trim();
    if (language) {
      queryParts.push(`language:${language.replace(/\s+/g, "-")}`);
    }

    const topic = githubTopic.trim().toLowerCase().replace(/\s+/g, "-");
    if (topic) {
      queryParts.push(`topic:${topic}`);
    }

    if (githubRecentDays > 0) {
      queryParts.push(`pushed:>=${getIsoDateDaysAgo(githubRecentDays)}`);
    }

    if (githubIssueSignal === "help-wanted" || githubIssueSignal === "both") {
      queryParts.push("help-wanted-issues:>0");
    }

    if (githubIssueSignal === "good-first" || githubIssueSignal === "both") {
      queryParts.push("good-first-issues:>0");
    }

    return queryParts.join(" ");
  };

  const runGithubSearch = async () => {
    const query = buildGithubSearchQuery();
    if (!query) {
      setGithubError("Enter a framework or ecosystem first.");
      setGithubResults([]);
      setGithubTotalCount(0);
      setGithubPage(1);
      return;
    }

    setIsGithubSearching(true);
    setGithubError(null);
    setGithubQuery(query);
    setGithubPage(1);

    try {
      const params = new URLSearchParams({
        q: query,
        sort: githubSort,
        order: "desc",
        per_page: "12",
      });
      const response = await fetch(`https://api.github.com/search/repositories?${params.toString()}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "GitHub search failed.");
      }

      const repos = Array.isArray(data.items) ? data.items : [];
      setGithubResults(repos.filter((repo: GithubRepoResult) => repo.open_issues_count > 0));
      setGithubTotalCount(typeof data.total_count === "number" ? data.total_count : 0);
      playBeep("success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "GitHub search failed.";
      setGithubError(message);
      setGithubResults([]);
      setGithubTotalCount(0);
      setGithubPage(1);
      playBeep("error");
    } finally {
      setIsGithubSearching(false);
    }
  };

  const githubTotalPages = Math.max(1, Math.ceil(githubResults.length / githubResultsPerPage));
  const githubPageStart = (githubPage - 1) * githubResultsPerPage;
  const githubPageResults = githubResults.slice(githubPageStart, githubPageStart + githubResultsPerPage);

  const renderAppHeader = (title: string) => (
    <div className="w-full max-w-3xl flex justify-between items-center mb-8 border-b border-white/10 pb-4">
      <span className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">{title}</span>
      <button
        type="button"
        onClick={() => {
          playBeep("click");
          setActiveSubapp(null);
          setActiveApp(null);
        }}
        className="flex items-center justify-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white cursor-pointer"
      >
        <ArrowLeft className="size-3.5" strokeWidth={1.5} />
        Dashboard
      </button>
    </div>
  );

  const renderSubappPlaceholder = (title: string) => (
    <div className="w-full max-w-3xl flex flex-col items-center animate-scale-up px-2">
      <div className="w-full flex justify-between items-center mb-8 border-b border-white/10 pb-4">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">{title}</span>
        <button
          type="button"
          onClick={() => {
            playBeep("click");
            setActiveSubapp(null);
          }}
          className="flex items-center justify-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Back
        </button>
      </div>
      <div className="flex min-h-[280px] w-full flex-col items-center justify-center border border-white/10 bg-white/[0.02] p-8">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-white/80">Under development</p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-zinc-600">Coming soon</p>
      </div>
    </div>
  );

  // Dynamic layout calculations based on viewport size
  const getLayout = (width: number, height: number) => {
    // Giant Newton's Cradle that covers the viewport
    const minR = width < 360 ? 38 : 50;
    const R = Math.max(minR, Math.min(180, Math.min(width, height) * 0.12));
    const L = Math.max(250, height * 0.65);
    // Anchor directly at the bottom edge of the top ceiling plate
    const yStart = 16;
    const xCenter = width / 2;
    return { R, L, yStart, xCenter };
  };

  // Web Audio click generator for collisions
  const playCollisionSound = (velocity: number) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = createAudioContext();
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const now = ctx.currentTime;
      
      const volume = Math.min(Math.max(velocity * 0.14, 0.015), 0.35);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(volume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      gainNode.connect(ctx.destination);
      
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(2600, now);
      osc1.connect(gainNode);
      
      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(850, now);
      osc2.connect(gainNode);
      
      osc1.start(now);
      osc1.stop(now + 0.06);
      osc2.start(now);
      osc2.stop(now + 0.06);
    } catch {
      // ignore
    }
  };


  // Mouse/Touch drag handlers
  const handleStartDrag = (clientX: number, clientY: number) => {
    const pointer = canvasPointerFromRef(canvasRef, clientX, clientY);
    if (!pointer) return;
    const { w, h, mx, my } = pointer;

    const { R, L, yStart, xCenter } = getLayout(w, h);
    
    mouseState.current.x = mx;
    mouseState.current.y = my;
    mouseState.current.isDown = true;
    
    const state = physicsState.current;
    let closestIndex = -1;
    let minDist = Infinity;
    
    for (let i = 0; i < 3; i++) {
      const xAnchor = xCenter + (i - 1) * 2 * R;
      const bx = xAnchor + L * Math.sin(state.theta[i]);
      const by = yStart + L * Math.cos(state.theta[i]);
      
      const dx = mx - bx;
      const dy = my - by;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < R * 1.8 && dist < minDist) {
        minDist = dist;
        closestIndex = i;
      }
    }
    
    if (closestIndex !== -1) {
      playBeep("click");
      state.draggedIndex = closestIndex;
      const xAnchor = xCenter + (closestIndex - 1) * 2 * R;
      state.targetTheta = Math.atan2(mx - xAnchor, my - yStart);
      state.prevDragTheta = state.targetTheta;
      // Record starting coordinates and time to detect click vs drag on release
      dragStartInfo.current = {
        x: mx,
        y: my,
        time: performance.now(),
      };
    }
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    const pointer = canvasPointerFromRef(canvasRef, clientX, clientY);
    if (!pointer) return;
    const { w, h, mx, my } = pointer;

    const { R, yStart, xCenter } = getLayout(w, h);
    
    mouseState.current.x = mx;
    mouseState.current.y = my;
    
    const state = physicsState.current;
    if (state.draggedIndex !== null) {
      const xAnchor = xCenter + (state.draggedIndex - 1) * 2 * R;
      let angle = Math.atan2(mx - xAnchor, my - yStart);
      
      const limit = (75 * Math.PI) / 180;
      angle = Math.max(-limit, Math.min(limit, angle));
      
      state.prevDragTheta = state.targetTheta;
      state.targetTheta = angle;
    }
  };

  const handleEndDrag = () => {
    mouseState.current.isDown = false;
    const state = physicsState.current;
    if (state.draggedIndex !== null) {
      const startX = dragStartInfo.current.x;
      const startY = dragStartInfo.current.y;
      const endX = mouseState.current.x;
      const endY = mouseState.current.y;
      
      const dist = Math.hypot(endX - startX, endY - startY);
      const duration = performance.now() - dragStartInfo.current.time;
      
      // If cursor moved less than 8px and duration is short, count as a click/tap
      if (dist < 8 && duration < 350) {
        playBeep("success");
        setActiveApp(state.draggedIndex + 1);
        state.draggedIndex = null;
        return;
      }

      playBeep("click");
      const dt = 1 / 60;
      const dragVel = (state.targetTheta - state.prevDragTheta) / dt;
      state.omega[state.draggedIndex] = Math.max(-14, Math.min(14, dragVel));
      state.draggedIndex = null;
    }
  };

  // Setup simulation, canvas resize handling, and render loop
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    };
    
    window.addEventListener("resize", handleResize);
    handleResize();

    let animationId: number;
    let lastTime = performance.now();

    const updatePhysics = (dtFrame: number, w: number, h: number) => {
      const state = physicsState.current;
      const subSteps = 16;
      const dt = dtFrame / subSteps;
      const { R, L } = getLayout(w, h);
      
      let collisionRecorded = false;
      let maxVelocity = 0;

      const { xCenter, yStart } = getLayout(w, h);
      const ballLayout = { xCenter, yStart, R, L };
      
      for (let step = 0; step < subSteps; step++) {
        // 1. Integrator
        for (let i = 0; i < 3; i++) {
          if (state.draggedIndex !== i) {
            const acc = -(2400 / L) * Math.sin(state.theta[i]) - 0.001 * state.omega[i];
            state.omega[i] += acc * dt;
            state.theta[i] += state.omega[i] * dt;
          }
        }

        // 2. Ceiling bounce check (reverses velocity when the top of the ball touches/crosses the ceiling line)
        const cosLimit = R / L;
        for (let i = 0; i < 3; i++) {
          if (state.draggedIndex !== i) {
            if (Math.cos(state.theta[i]) <= cosLimit) {
              state.omega[i] = -state.omega[i] * 0.55; // Reverse velocity with rebound damping
              state.theta[i] = Math.sign(state.theta[i]) * Math.acos(cosLimit - 0.0001); // Keep below ceiling
            }
          }
        }

        // 3. Drag / push constraints
        if (state.draggedIndex !== null) {
          const idx = state.draggedIndex;
          state.theta[idx] = state.targetTheta;
          state.omega[idx] = 0;
          
          for (let i = idx; i < 2; i++) {
            if (state.theta[i] > state.theta[i+1]) {
              state.theta[i+1] = state.theta[i];
              state.omega[i+1] = 0;
            }
          }
          for (let i = idx; i > 0; i--) {
            if (state.theta[i] < state.theta[i-1]) {
              state.theta[i-1] = state.theta[i];
              state.omega[i-1] = 0;
            }
          }
        }

        // 4. Sequential 1D elastic collisions (Velocity swap)
        let collided = true;
        let iter = 0;
        while (collided && iter < 5) {
          collided = false;
          for (let i = 0; i < 2; i++) {
            const { dist } = getBallPairPositions(ballLayout, state.theta, i);
            if (dist <= 2 * R) {
              if (state.omega[i] > state.omega[i+1]) {
                const w1 = state.omega[i];
                const w2 = state.omega[i+1];
                
                state.omega[i] = 0.5 * ((1 - 0.99) * w1 + (1 + 0.99) * w2);
                state.omega[i+1] = 0.5 * ((1 + 0.99) * w1 + (1 - 0.99) * w2);
                
                collisionRecorded = true;
                const v = w1 - w2;
                if (v > maxVelocity) {
                  maxVelocity = v;
                }
                collided = true;
              }
            }
          }
          iter++;
        }

        // 5. Hard positional projection to ensure balls NEVER overlap/intersect
        let overlapCorrectionIter = 0;
        let positionsCorrected = true;
        while (positionsCorrected && overlapCorrectionIter < 10) {
          positionsCorrected = false;
          for (let i = 0; i < 2; i++) {
            const { x1, y1, x2, y2, dist } = getBallPairPositions(ballLayout, state.theta, i);
            const minDist = 2 * R;
            
            if (dist < minDist) {
              const overlap = minDist - dist;
              const dx = (x2 - x1) / (dist || 1);
              const dy = (y2 - y1) / (dist || 1);
              
              const pushX = dx * overlap * 0.5;
              const pushY = dy * overlap * 0.5;
              
              // Project 2D push displacement onto circular pendulum tangent
              const tangentX1 = Math.cos(state.theta[i]);
              const tangentY1 = -Math.sin(state.theta[i]);
              const dTheta1 = (-pushX * tangentX1 - pushY * tangentY1) / L;
              
              const tangentX2 = Math.cos(state.theta[i+1]);
              const tangentY2 = -Math.sin(state.theta[i+1]);
              const dTheta2 = (pushX * tangentX2 + pushY * tangentY2) / L;
              
              if (state.draggedIndex === i) {
                state.theta[i+1] += dTheta2 * 2;
              } else if (state.draggedIndex === i+1) {
                state.theta[i] += dTheta1 * 2;
              } else {
                state.theta[i] += dTheta1;
                state.theta[i+1] += dTheta2;
              }
              positionsCorrected = true;
            }
          }
          overlapCorrectionIter++;
        }
      }

      if (activeAppRef.current === null && collisionRecorded && maxVelocity > 0.05) {
        playCollisionSound(maxVelocity);
      }
    };

    const draw = (w: number, h: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      
      const state = physicsState.current;
      const { R, L, yStart, xCenter } = getLayout(w, h);
      
      // Draw a sleek metallic ceiling plate at the top (covering the anchor points)
      const ceilingGrad = ctx.createLinearGradient(0, 0, w, 0);
      ceilingGrad.addColorStop(0, "#09090b");
      ceilingGrad.addColorStop(0.2, "#18181b");
      ceilingGrad.addColorStop(0.5, "#3f3f46"); // metallic highlight in the center
      ceilingGrad.addColorStop(0.8, "#18181b");
      ceilingGrad.addColorStop(1, "#09090b");
      
      ctx.fillStyle = ceilingGrad;
      ctx.fillRect(0, 0, w, 16); // 16px high plate at the top
      
      // Highlight edge at the bottom of the plate
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.lineTo(w, 16);
      ctx.stroke();

      // Draw 3 small metallic anchor pegs where the strings hook into the ceiling
      for (let i = 0; i < 3; i++) {
        const xAnchor = xCenter + (i - 1) * 2 * R;
        ctx.fillStyle = "#27272a";
        ctx.beginPath();
        ctx.arc(xAnchor, 16, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      
      const yGround = yStart + L + R;

      // Draw a soft ambient glow pool under the entire cradle area on the floor
      const floorGlow = ctx.createRadialGradient(xCenter, yGround + 24, 0, xCenter, yGround + 24, R * 5);
      floorGlow.addColorStop(0, "rgba(255, 255, 255, 0.05)");
      floorGlow.addColorStop(0.5, "rgba(255, 255, 255, 0.015)");
      floorGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
      
      ctx.save();
      ctx.translate(xCenter, yGround + 24);
      ctx.scale(1, 0.18);
      ctx.fillStyle = floorGlow;
      ctx.beginPath();
      ctx.arc(0, 0, R * 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      // Ground Shadows for each ball
      for (let i = 0; i < 3; i++) {
        const xAnchor = xCenter + (i - 1) * 2 * R;
        const x = xAnchor + L * Math.sin(state.theta[i]);
        const y = yStart + L * Math.cos(state.theta[i]);
        
        const hOffset = y - (yStart + L);
        const shadowScale = Math.max(0.3, 1 - hOffset / 120);
        const shadowOpacity = Math.max(0, 0.35 * (1 - hOffset / 150));
        const shadowRadius = R * 1.5 * shadowScale;
        
        ctx.save();
        ctx.translate(x, yGround + 24);
        ctx.scale(1, 0.22); // Squash vertically to create the 3D floor perspective
        
        // 1. Dark contact occlusion shadow
        const shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRadius);
        shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.95)");
        shadowGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.5)");
        shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, shadowRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        // 2. Soft reflected glow ring on the floor (corona effect)
        const glowGrad = ctx.createRadialGradient(0, 0, shadowRadius * 0.2, 0, 0, shadowRadius * 1.3);
        glowGrad.addColorStop(0, `rgba(255, 255, 255, ${shadowOpacity * 0.15})`);
        glowGrad.addColorStop(0.5, `rgba(255, 255, 255, ${shadowOpacity * 0.05})`);
        glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, shadowRadius * 1.3, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
      }

      // Strings and Balls
      for (let i = 0; i < 3; i++) {
        const xAnchor = xCenter + (i - 1) * 2 * R;
        const x = xAnchor + L * Math.sin(state.theta[i]);
        const y = yStart + L * Math.cos(state.theta[i]);

        // Draw double string for realism
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xAnchor - 2, yStart);
        ctx.lineTo(x, y);
        ctx.moveTo(xAnchor + 2, yStart);
        ctx.lineTo(x, y);
        ctx.stroke();

        // 1. Core deep obsidian glass sphere base
        const grad = ctx.createRadialGradient(
          x - R * 0.2, y - R * 0.2, R * 0.1,
          x, y, R
        );
        grad.addColorStop(0, "#27272a"); // zinc-800 core
        grad.addColorStop(0.5, "#09090b"); // zinc-950 deep obsidian
        grad.addColorStop(1, "#030303"); // pure dark edge
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, 2 * Math.PI);
        ctx.fill();

        // 2. Soft reflected floor rim light on the bottom
        const rimGrad = ctx.createRadialGradient(
          x, y + R * 0.5, 0,
          x, y + R * 0.5, R * 0.7
        );
        rimGrad.addColorStop(0, "rgba(255, 255, 255, 0.15)");
        rimGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = rimGrad;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, 2 * Math.PI);
        ctx.fill();

        // 3. Curved specular light source highlight & pin reflection (creates real 3D gloss)
        ctx.save();
        ctx.translate(x, y);
        
        // Soft gradient reflection glow
        const specGrad = ctx.createRadialGradient(
          -R * 0.35, -R * 0.35, 0,
          -R * 0.35, -R * 0.35, R * 0.45
        );
        specGrad.addColorStop(0, "rgba(255, 255, 255, 0.25)");
        specGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
        specGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = specGrad;
        ctx.beginPath();
        ctx.arc(-R * 0.35, -R * 0.35, R * 0.45, 0, 2 * Math.PI);
        ctx.fill();
        
        // Sharp glossy pin-light reflection dot
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(-R * 0.35, -R * 0.35, R * 0.035, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();

        // 4. Fine outer rim highlight (gives glass/obsidian edge definition)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // 5. Minimalist floating text label with soft ambient glow
        ctx.save();
        ctx.font = `bold ${Math.max(12, Math.round(R * 0.23))}px var(--font-heading), Montserrat, Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        try {
          (ctx as CanvasContextWithLetterSpacing).letterSpacing = "3px";
        } catch {
          // letterSpacing unsupported in this browser
        }

        // Soft white ambient glow behind the text to make it pop naturally
        ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
        ctx.shadowBlur = 4;
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        const label = i === 1 ? "CLOCK" : `APP ${i + 1}`;
        ctx.fillText(label, x, y);
        ctx.restore();
      }
    };

    const renderLoop = (time: number) => {
      const dtFrame = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const w = window.innerWidth;
      const h = window.innerHeight;

      updatePhysics(dtFrame, w, h);
      draw(w, h);
      animationId = requestAnimationFrame(renderLoop);
    };

    animationId = requestAnimationFrame(renderLoop);
    
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, [isAuthenticated]);

  // Render loading splash during initial authentication resolution
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center font-sans">
        <div className="font-mono text-xs tracking-widest text-zinc-500 uppercase animate-pulse">
          Initializing AuraFlow...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden flex flex-col font-sans select-none">
      
      {/* Decorative ambient glowing grids behind blur */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-white/[0.04] rounded-full blur-[100px] pointer-events-none animate-pulse-glow" />
      <div 
        className="absolute inset-0 opacity-[0.01] pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]"
      />

      {/* 1. Fullscreen PIN Security Overlay */}
      {!isAuthenticated && (
        <div 
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black transition-all duration-500 ${
            isUnlocked ? "opacity-0 scale-[1.08] pointer-events-none" : "opacity-100 scale-100"
          }`}
        >
          {/* Light glow effect in the center behind the boxes */}
          <div className="absolute w-[250px] h-[250px] bg-white/[0.05] rounded-full blur-[70px] pointer-events-none animate-pulse" />

          <div 
            className={`relative flex flex-col items-center justify-center p-4 transition-all duration-300 ${
              isShaking ? "animate-shake" : ""
            }`}
          >
            {/* 4 Boxes in the center */}
            <div 
              className="relative flex justify-center gap-4 cursor-pointer" 
              onClick={() => inputRef.current?.focus()}
            >
              <input
                ref={inputRef}
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                maxLength={4}
                value={pinDigits.join("")}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  const digits = val.split("");
                  setPinDigits(digits);
                  if (digits.length === 4) {
                    submitPin(val);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                autoFocus
                disabled={isVerifying || isUnlocked}
              />
              {[0, 1, 2, 3].map((index) => {
                const filled = pinDigits.length > index;
                const isFocused = pinDigits.length === index && !isVerifying && !isUnlocked;
                return (
                  <div
                    key={index}
                    className="flex flex-col items-center gap-3 w-12"
                  >
                    <div className={`h-8 flex items-center justify-center font-mono text-2xl font-light transition-all duration-200 ${
                      filled ? "text-white" : "text-white/20"
                    }`}>
                      {filled ? (isUnlocked ? "" : "•") : ""}
                    </div>
                    <div className={`w-full h-[1.5px] transition-all duration-300 ${
                      isFocused 
                        ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-x-110" 
                        : filled 
                          ? "bg-white/60" 
                          : "bg-white/15"
                    }`} />
                  </div>
                );
              })}
            </div>
            
            {/* Minimal feedback indicator for status/error */}
            {authError && (
              <div className="absolute -bottom-8 font-mono text-[10px] text-white/40 uppercase tracking-widest animate-pulse">
                {authError}
              </div>
            )}
          </div>
        </div>
      )}      {/* 2. App Subpages Overlay (Absolute overlay to keep the canvas mounted) */}
      {activeApp !== null && (
        <div
          className={`absolute inset-0 z-30 bg-black flex flex-col font-sans items-center p-6 justify-start ${
            activeSubapp === "nosql-client" || activeSubapp === "subapp4" || activeSubapp === "postman" || activeSubapp === "writing-agent" ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          
          {activeApp === 2 ? (
            // Clock & Alarm & Timer App (Floating, borderless, gradient-free layout)
            <div className="w-full flex flex-col items-center justify-start gap-8 animate-scale-up select-none max-w-3xl">
              {!(timerAlarm || alarmTriggered) && renderAppHeader("Clock")}
              
              {timerAlarm || alarmTriggered ? (
                // Alarm Ringing Overlay
                <div className="flex flex-col items-center justify-center gap-8 py-12 text-center select-none animate-scale-up">
                  <svg 
                    className="w-32 h-32 text-white animate-pulse" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="0.8"
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <div className="font-mono text-xs tracking-[0.35em] text-zinc-500 uppercase mt-4">
                    {timerAlarm ? "TIMER COUNTDOWN COMPLETE" : "ALARM WAKE-UP EVENT"}
                  </div>
                  <button
                    onClick={() => {
                      playBeep("click");
                      setTimerAlarm(false);
                      setAlarmTriggered(false);
                    }}
                    className="cool-circle-btn mt-10"
                  >
                    <span>STOP</span>
                  </button>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center gap-2 select-none">
                  {/* Tab Selector */}
                  <div className="flex items-center gap-10 justify-center mb-12 select-none">
                    <button
                      onClick={() => { playBeep("click"); setActiveTab("clock"); }}
                      className={`font-mono text-xs tracking-[0.3em] uppercase transition-all ${
                        activeTab === "clock" ? "text-white font-medium scale-105" : "text-zinc-600 hover:text-zinc-400"
                      }`}
                    >
                      CLOCK
                    </button>
                    <span className="text-zinc-800 text-[10px] select-none">•</span>
                    <button
                      onClick={() => { playBeep("click"); setActiveTab("alarm"); }}
                      className={`font-mono text-xs tracking-[0.3em] uppercase transition-all ${
                        activeTab === "alarm" ? "text-white font-medium scale-105" : "text-zinc-600 hover:text-zinc-400"
                      }`}
                    >
                      ALARM
                    </button>
                    <span className="text-zinc-800 text-[10px] select-none">•</span>
                    <button
                      onClick={() => { playBeep("click"); setActiveTab("timer"); }}
                      className={`font-mono text-xs tracking-[0.3em] uppercase transition-all ${
                        activeTab === "timer" ? "text-white font-medium scale-105" : "text-zinc-600 hover:text-zinc-400"
                      }`}
                    >
                      TIMER
                    </button>
                    <span className="text-zinc-800 text-[10px] select-none">•</span>
                    <button
                      onClick={() => { playBeep("click"); setActiveTab("calendar"); }}
                      className={`font-mono text-xs tracking-[0.3em] uppercase transition-all ${
                        activeTab === "calendar" ? "text-white font-medium scale-105" : "text-zinc-600 hover:text-zinc-400"
                      }`}
                    >
                      CALENDAR
                    </button>
                  </div>

                  {activeTab === "clock" ? (
                    // Clock Mode (Analog + Digital)
                    <div className="flex flex-col items-center justify-center w-full select-none animate-scale-up">
                      {/* Minimalist SVG Analog Clock */}
                      {(() => {
                        const hr = currentTime.getHours();
                        const mn = currentTime.getMinutes();
                        const sc = currentTime.getSeconds();
                        const hrAngle = (hr % 12) * 30 + mn * 0.5;
                        const minAngle = mn * 6 + sc * 0.1;
                        const secAngle = sc * 6;
                        return (
                          <svg viewBox="0 0 220 220" className="mb-12 select-none w-full max-w-[240px] sm:max-w-[320px] aspect-square">
                            {/* Outer rim */}
                            <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1.2" />
                            {/* Major ticks */}
                            {[0, 90, 180, 270].map((angle, idx) => (
                              <line
                                key={`maj-${idx}`}
                                x1="110"
                                y1="18"
                                x2="110"
                                y2="28"
                                transform={`rotate(${angle} 110 110)`}
                                stroke="rgba(255, 255, 255, 0.5)"
                                strokeWidth="1.2"
                              />
                            ))}
                            {/* Minor ticks */}
                            {Array.from({ length: 12 }).map((_, i) => {
                              if (i % 3 === 0) return null;
                              return (
                                <line
                                  key={`min-${i}`}
                                  x1="110"
                                  y1="18"
                                  x2="110"
                                  y2="23"
                                  transform={`rotate(${i * 30} 110 110)`}
                                  stroke="rgba(255, 255, 255, 0.15)"
                                  strokeWidth="0.8"
                                />
                              );
                            })}
                            {/* Hour Hand */}
                            <line
                              x1="110"
                              y1="110"
                              x2="110"
                              y2="60"
                              transform={`rotate(${hrAngle} 110 110)`}
                              stroke="rgba(255, 255, 255, 0.85)"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                            {/* Minute Hand */}
                            <line
                              x1="110"
                              y1="110"
                              x2="110"
                              y2="42"
                              transform={`rotate(${minAngle} 110 110)`}
                              stroke="rgba(255, 255, 255, 0.6)"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                            />
                            {/* Second Hand */}
                            <line
                              x1="110"
                              y1="110"
                              x2="110"
                              y2="28"
                              transform={`rotate(${secAngle} 110 110)`}
                              stroke="#ffffff"
                              strokeWidth="0.8"
                              strokeLinecap="round"
                            />
                            {/* Center Pin */}
                            <circle cx="110" cy="110" r="2.5" fill="#ffffff" />
                          </svg>
                        );
                      })()}

                      {/* Large Digital Display */}
                      <div className="font-sans font-extralight text-4xl xs:text-5xl sm:text-7xl md:text-[8rem] text-white tracking-widest select-none flex flex-wrap items-baseline justify-center gap-1">
                        <span>{currentTime.getHours().toString().padStart(2, '0')}</span>
                        <span className="text-zinc-700 px-2 animate-pulse">:</span>
                        <span>{currentTime.getMinutes().toString().padStart(2, '0')}</span>
                        <span className="text-3xl md:text-4xl text-zinc-500 font-light ml-6">
                          {currentTime.getSeconds().toString().padStart(2, '0')}
                        </span>
                      </div>

                      {/* Date */}
                      <div className="font-mono text-[11px] tracking-[0.35em] text-zinc-500 uppercase mt-8 select-none">
                        {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                    </div>
                  ) : activeTab === "alarm" ? (
                    // Alarm Mode
                    <div className="flex flex-col items-center justify-center w-full select-none animate-scale-up">
                      <div className="wheel-picker-responsive-wrap">
                        <WheelPicker
                          min={0}
                          max={23}
                          value={alarmH}
                          onChange={setAlarmH}
                          label="HOURS"
                        />
                        <span className="text-zinc-800 font-mono text-5xl font-extralight -mt-16">:</span>
                        <WheelPicker
                          min={0}
                          max={59}
                          value={alarmM}
                          onChange={setAlarmM}
                          label="MINUTES"
                        />
                      </div>

                      <button
                        onClick={() => {
                          playBeep("success");
                          setAlarmActive(!alarmActive);
                        }}
                        className="cool-circle-btn mt-16"
                      >
                        <span>{alarmActive ? "DISARM" : "ARM"}</span>
                      </button>

                      {alarmActive && (
                        <div className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 uppercase mt-10 select-none animate-pulse">
                          ALARM SET FOR {alarmH.toString().padStart(2, '0')}:{alarmM.toString().padStart(2, '0')}
                        </div>
                      )}
                    </div>
                  ) : activeTab === "calendar" ? (
                    token ? (
                      <ClockCalendar token={token} playBeep={playBeep} />
                    ) : null
                  ) : (
                    // Timer Mode
                    <div className="flex flex-col items-center justify-center w-full select-none animate-scale-up">
                      {isTimerActive ? (
                        // Active countdown display
                        <div className="flex flex-col items-center gap-12 py-4">
                          <div className="relative w-[70vw] h-[70vw] max-w-[280px] max-h-[280px] flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                              <circle
                                cx="50"
                                cy="50"
                                r="46"
                                className="stroke-zinc-950 fill-none"
                                strokeWidth="0.8"
                              />
                              <circle
                                cx="50"
                                cy="50"
                                r="46"
                                className="stroke-white fill-none transition-all duration-1000 ease-linear"
                                strokeWidth="1.2"
                                strokeDasharray="289"
                                strokeDashoffset={timerDuration > 0 ? 289 * (1 - timerRemaining / timerDuration) : 0}
                                strokeLinecap="round"
                              />
                            </svg>
                            
                            <div className="absolute flex flex-col items-center justify-center font-mono">
                              <span className="text-6xl font-extralight text-white tracking-widest">
                                {Math.floor(timerRemaining / 60).toString().padStart(2, '0')}:
                                {(timerRemaining % 60).toString().padStart(2, '0')}
                              </span>
                              {timerRemaining >= 3600 ? (
                                <span className="text-[9px] text-zinc-500 uppercase tracking-[0.25em] mt-4">
                                  {Math.floor(timerRemaining / 3600)}h remaining
                                </span>
                              ) : (
                                <span className="text-[9px] text-zinc-500 uppercase tracking-[0.25em] mt-4 animate-pulse">
                                  COUNTDOWN
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Controls */}
                          <div className="flex gap-8 mt-2 items-center">
                            <button
                              onClick={() => {
                                playBeep("click");
                                setIsTimerPaused(!isTimerPaused);
                              }}
                              className="text-white opacity-55 hover:opacity-100 font-mono text-[11px] tracking-[0.2em] uppercase transition-opacity cursor-pointer"
                            >
                              {isTimerPaused ? "RESUME" : "PAUSE"}
                            </button>
                            <span className="text-zinc-800">|</span>
                            <button
                              onClick={() => {
                                playBeep("error");
                                setIsTimerActive(false);
                                setIsTimerPaused(false);
                                setTimerRemaining(0);
                              }}
                              className="text-zinc-500 hover:text-white font-mono text-[11px] tracking-[0.2em] uppercase transition-colors cursor-pointer"
                            >
                              RESET
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Timer setup layout
                        <div className="flex flex-col items-center justify-center w-full">
                          <div className="wheel-picker-responsive-wrap">
                            <WheelPicker
                              min={0}
                              max={23}
                              value={timerH}
                              onChange={setTimerH}
                              label="HOURS"
                            />
                            <span className="text-zinc-800 font-mono text-5xl font-extralight -mt-16">:</span>
                            <WheelPicker
                              min={0}
                              max={59}
                              value={timerM}
                              onChange={setTimerM}
                              label="MINUTES"
                            />
                            <span className="text-zinc-800 font-mono text-5xl font-extralight -mt-16">:</span>
                            <WheelPicker
                              min={0}
                              max={59}
                              value={timerS}
                              onChange={setTimerS}
                              label="SECONDS"
                            />
                          </div>

                          <button
                            onClick={() => {
                              const totalSec = timerH * 3600 + timerM * 60 + timerS;
                              if (totalSec > 0) {
                                playBeep("success");
                                setTimerDuration(totalSec);
                                setTimerRemaining(totalSec);
                                setIsTimerActive(true);
                                setIsTimerPaused(false);
                              } else {
                                playBeep("error");
                              }
                            }}
                            className="cool-circle-btn mt-16"
                          >
                            <span>START</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeApp === 1 ? (
            activeSubapp === "github-issue-analyser" ? (
              <div className="github-analyser w-[calc(100vw-24px)] max-w-none animate-scale-up">
                <div className="ga-compact-bar">
                  <div className="flex min-w-0 items-center gap-2">
                    <GitFork className="size-4 shrink-0 text-zinc-500" strokeWidth={1.4} />
                    <h1 className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      GitHub Issue Analyser
                    </h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playBeep("click");
                      setActiveSubapp(null);
                    }}
                    className="flex items-center justify-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white"
                  >
                    Back
                  </button>
                </div>

                <div className="ga-analyser-grid grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                  <section className="border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-5 flex items-center gap-3">
                      <SlidersHorizontal className="size-5 text-zinc-400" strokeWidth={1.4} />
                      <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">
                        filters
                      </h2>
                    </div>

                    <div className="ga-control-grid">
                      <label className="block">
                        <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                          framework or ecosystem
                        </span>
                        <select
                          value={githubFramework}
                          onChange={(event) => setGithubFramework(event.target.value)}
                          className="w-full border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-white/45"
                        >
                          {githubFrameworkOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                            language
                          </span>
                          <select
                            value={githubLanguage}
                            onChange={(event) => setGithubLanguage(event.target.value)}
                            className="w-full border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-white/45"
                          >
                            {githubLanguageOptions.map((language) => (
                              <option key={language} value={language === "Any language" ? "" : language}>
                                {language}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                            topic
                          </span>
                          <select
                            value={githubTopic}
                            onChange={(event) => setGithubTopic(event.target.value)}
                            className="w-full border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-white/45"
                          >
                            {githubTopicOptions.map((option) => (
                              <option key={option.value || "any-topic"} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                            min stars
                          </span>
                          <select
                            value={githubMinStars}
                            onChange={(event) => setGithubMinStars(Number(event.target.value))}
                            className="w-full border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition-colors focus:border-white/45"
                          >
                            {githubStarOptions.map((stars) => (
                              <option key={stars} value={stars}>
                                {stars === 0 ? "Any stars" : `${stars.toLocaleString()}+ stars`}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                            repository activity
                          </span>
                          <select
                            value={githubRecentDays}
                            onChange={(event) => setGithubRecentDays(Number(event.target.value))}
                            className="w-full border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition-colors focus:border-white/45"
                          >
                            {githubRecencyOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                            contribution signal
                          </span>
                          <select
                            value={githubIssueSignal}
                            onChange={(event) => setGithubIssueSignal(event.target.value as GithubIssueSignal)}
                            className="w-full border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition-colors focus:border-white/45"
                          >
                            <option value="help-wanted">Help wanted issues</option>
                            <option value="good-first">Good first issues</option>
                            <option value="both">Help wanted + good first</option>
                            <option value="any-open">Any repo with open issues</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                            forks
                          </span>
                          <select
                            value={githubIncludeForks ? "include" : "exclude"}
                            onChange={(event) => setGithubIncludeForks(event.target.value === "include")}
                            className="w-full border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition-colors focus:border-white/45"
                          >
                            <option value="exclude">Exclude forks</option>
                            <option value="include">Include forks</option>
                          </select>
                        </label>
                      </div>

                      <label className="block">
                        <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                          sort by
                        </span>
                        <select
                          value={githubSort}
                          onChange={(event) => setGithubSort(event.target.value as GithubSearchSort)}
                          className="w-full border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none transition-colors focus:border-white/45"
                        >
                          <option value="help-wanted-issues">Help wanted issues</option>
                          <option value="stars">Stars</option>
                          <option value="updated">Recently updated</option>
                          <option value="forks">Forks</option>
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={runGithubSearch}
                        disabled={isGithubSearching}
                        className="flex w-full items-center justify-center gap-3 bg-white px-5 py-4 font-mono text-[11px] uppercase tracking-[0.28em] text-black transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-45"
                      >
                        {isGithubSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                        Analyse repos
                      </button>
                    </div>
                  </section>

                  <section className="ga-results-panel min-h-[520px] border border-white/10 bg-white/[0.025] p-5">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-white">
                          results
                        </h2>
                        <p className="mt-2 text-xs text-zinc-600">
                          {githubQuery ? githubQuery : "Search query will appear here after analysis."}
                        </p>
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        {githubTotalCount > 0 ? `${githubTotalCount.toLocaleString()} GitHub matches` : "No search yet"}
                      </div>
                    </div>

                    {githubError ? (
                      <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center text-zinc-500">
                        <AlertCircle className="size-10 text-white/50" strokeWidth={1.2} />
                        <p className="max-w-md text-sm leading-6">{githubError}</p>
                      </div>
                    ) : githubResults.length > 0 ? (
                      <>
                        <div className="ga-results-grid grid gap-4 xl:grid-cols-2">
                          {githubPageResults.map((repo) => (
                          <article
                            key={repo.id}
                            className="flex min-h-64 flex-col justify-between border border-white/10 bg-black p-5 transition-colors hover:border-white/30"
                          >
                            <div>
                              <div className="mb-4 flex items-start justify-between gap-4">
                                <div>
                                  <h3 className="break-words text-lg font-medium leading-6 text-white">
                                    {repo.full_name}
                                  </h3>
                                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500">
                                    {repo.description || "No repository description provided."}
                                  </p>
                                </div>
                                <a
                                  href={repo.html_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="shrink-0 text-zinc-500 transition-colors hover:text-white"
                                  title={`Open ${repo.full_name}`}
                                >
                                  <ExternalLink className="size-5" strokeWidth={1.4} />
                                </a>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {repo.language && (
                                  <span className="border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                                    {repo.language}
                                  </span>
                                )}
                                {(repo.topics || []).slice(0, 4).map((topic) => (
                                  <span
                                    key={topic}
                                    className="border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500"
                                  >
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="mt-6 border-t border-white/10 pt-4">
                              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-400 sm:grid sm:grid-cols-3 sm:gap-3">
                                <div className="flex items-center gap-2">
                                  <Star className="size-4" strokeWidth={1.3} />
                                  {repo.stargazers_count.toLocaleString()}
                                </div>
                                <div className="flex items-center gap-2">
                                  <GitFork className="size-4" strokeWidth={1.3} />
                                  {repo.forks_count.toLocaleString()}
                                </div>
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="size-4" strokeWidth={1.3} />
                                  {repo.open_issues_count.toLocaleString()}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                                  pushed {new Date(repo.pushed_at).toLocaleDateString()}
                                </span>
                                <a
                                  href={`${repo.html_url}/issues`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono text-[10px] uppercase tracking-[0.22em] text-white transition-opacity hover:opacity-70"
                                >
                                  Open issues
                                </a>
                              </div>
                            </div>
                            </article>
                          ))}
                        </div>
                        <div className="ga-pagination">
                          <span>
                            Page {githubPage} of {githubTotalPages}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setGithubPage((page) => Math.max(1, page - 1))}
                              disabled={githubPage === 1}
                              className="border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Prev
                            </button>
                            <button
                              type="button"
                              onClick={() => setGithubPage((page) => Math.min(githubTotalPages, page + 1))}
                              disabled={githubPage === githubTotalPages}
                              className="border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
                        <Search className="size-10 text-white/40" strokeWidth={1.2} />
                        <p className="max-w-md text-sm leading-6 text-zinc-500">
                          Enter a framework like React, Django, Rust, or Next.js, then analyse repositories with open issues and contributor-friendly labels.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            ) : activeSubapp === "expense-tracker" ? (
              <ExpenseTracker
                token={token!}
                onBack={() => { playBeep("click"); setActiveSubapp(null); }}
                playBeep={playBeep}
              />
            ) : activeSubapp === "nosql-client" ? (
              <NoSqlClient
                token={token!}
                onBack={() => { playBeep("click"); setActiveSubapp(null); }}
                playBeep={playBeep}
              />
            ) : activeSubapp === "subapp4" ? (
              <SqlClient
                token={token!}
                onBack={() => { playBeep("click"); setActiveSubapp(null); }}
                playBeep={playBeep}
              />
            ) : activeSubapp === "postman" ? (
              <PostmanClient
                token={token!}
                onBack={() => { playBeep("click"); setActiveSubapp(null); }}
                playBeep={playBeep}
              />
            ) : activeSubapp === "writing-agent" ? (
              <WritingAgent
                token={token!}
                onBack={() => { playBeep("click"); setActiveSubapp(null); }}
                playBeep={playBeep}
              />
            ) : activeSubapp && placeholderSubappIds.has(activeSubapp) ? (
              renderSubappPlaceholder(appOneSubapps.find((s) => s.id === activeSubapp)?.label ?? "Module")
            ) : (
              <div className="w-full max-w-6xl flex flex-col items-center animate-scale-up px-2">
                {renderAppHeader("Developer Utility Portal")}
                <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                  {appOneSubapps.map((subapp) => (
                    <button
                      key={subapp.id}
                      type="button"
                      onClick={() => {
                        playBeep("click");
                        setActiveSubapp(subapp.id);
                      }}
                      className="group flex aspect-square min-h-24 flex-col items-center justify-center gap-2 border border-white/10 bg-white/[0.03] px-3 text-center transition-all duration-300 hover:-translate-y-1 hover:border-white/35 hover:bg-white/[0.08] hover:text-white focus-visible:border-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 sm:min-h-28"
                    >
                      <span className="font-mono text-xs tracking-[0.18em] text-white/80 transition-transform duration-300 group-hover:scale-105 sm:text-sm">
                        {subapp.label}
                      </span>
                      <span className="max-w-56 text-xs leading-5 text-zinc-600">
                        {subapp.detail}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
            // Default App Subpages (APP 3 / 4)
            <div className="w-full max-w-3xl flex flex-col items-center animate-scale-up px-2">
              {renderAppHeader(`Utility Module ${activeApp}`)}
              <div className="flex flex-col items-center justify-center min-h-[300px] border border-white/10 bg-white/[0.02] p-8 w-full">
                <div className="font-mono text-xl tracking-[0.2em] text-white uppercase animate-pulse font-bold">
                  Module {activeApp} Under Development
                </div>
                <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mt-4">
                  Reserved for future system integrations
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Main Authenticated Dashboard (Fullscreen Newton's Cradle) */}
      <div 
        className={`w-screen h-screen relative bg-black transition-all duration-700 ${
          isAuthenticated && activeApp === null
            ? "blur-none scale-100 opacity-100" 
            : "blur-xl scale-95 opacity-20 pointer-events-none"
        }`}
      >
        {/* Faint, minimal lock button in top-right corner */}
        {isAuthenticated && (
          <button
            onClick={handleLogout}
            className="absolute top-6 right-6 opacity-25 hover:opacity-100 transition-opacity p-2 text-white outline-none cursor-pointer z-20"
            title="Lock Console"
          >
            <LogOut className="size-5" />
          </button>
        )}

        {/* Fullscreen Canvas Newton's Cradle Display */}
        <canvas
          ref={canvasRef}
          onMouseDown={(e) => handleStartDrag(e.clientX, e.clientY)}
          onMouseMove={(e) => handleDragMove(e.clientX, e.clientY)}
          onMouseUp={handleEndDrag}
          onMouseLeave={handleEndDrag}
          onTouchStart={(e) => {
            if (e.touches.length > 0) {
              handleStartDrag(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length > 0) {
              handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onTouchEnd={handleEndDrag}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing bg-black"
        />
      </div>
    </div>
  );
}

export default App;
