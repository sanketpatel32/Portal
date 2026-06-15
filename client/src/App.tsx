import { lazy, Suspense, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import type { AppOneSubappId } from "./types/app";
import { playBeep } from "./lib/audio";
import {
  clearNavigationPath,
  parseNavigationFromPath,
  readInitialNavigation,
  updateNavigationPath,
} from "./lib/app-navigation";
import { PinLockScreen } from "./components/PinLockScreen";
import { NewtonsCradle } from "./components/NewtonsCradle";
import { ModuleHeaderBar } from "./components/ui/ModuleHeaderBar";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { LoadingSpinner } from "./components/ui/LoadingSpinner";
import { cn } from "./lib/utils";

// Heavy subapps are code-split: each becomes its own lazy chunk loaded only when
// the user opens that tile. This keeps the initial PIN-screen payload small
// (React + PinLockScreen + NewtonsCradle) instead of shipping the entire app
// (SQL/NoSQL/Postman/Expense/GitHub/Writing/Clock/Bookmark + radix/day-picker)
// to every visitor up front.
const ClockTimerAlarm = lazy(() =>
  import("./components/ClockTimerAlarm").then((m) => ({ default: m.ClockTimerAlarm })),
);
const GithubAnalyser = lazy(() =>
  import("./components/GithubAnalyser").then((m) => ({ default: m.GithubAnalyser })),
);
const ExpenseTracker = lazy(() =>
  import("./components/ExpenseTracker").then((m) => ({ default: m.ExpenseTracker })),
);
const NoSqlClient = lazy(() =>
  import("./components/NoSqlClient").then((m) => ({ default: m.NoSqlClient })),
);
const SqlClient = lazy(() =>
  import("./components/SqlClient").then((m) => ({ default: m.SqlClient })),
);
const PostmanClient = lazy(() =>
  import("./components/PostmanClient").then((m) => ({ default: m.PostmanClient })),
);
const WritingAgent = lazy(() =>
  import("./components/WritingAgent").then((m) => ({ default: m.WritingAgent })),
);
const BookmarkManager = lazy(() =>
  import("./components/BookmarkManager").then((m) => ({ default: m.BookmarkManager })),
);

const placeholderSubappIds = new Set<AppOneSubappId>(["subapp8", "subapp9", "subapp10"]);

const appOneSubapps: Array<{ id: AppOneSubappId; label: string; detail: string }> = [
  {
    id: "github-issue-analyser",
    label: "GitHub Issue Analyser",
    detail: "Find open-source repos with open issues and contribution signals",
  },
  {
    id: "expense-tracker",
    label: "Expense Tracker",
    detail: "Track spending by category with command-line interactions",
  },
  { id: "nosql-client", label: "NoSQL Client", detail: "Browse, filter and edit MongoDB collections" },
  { id: "subapp4", label: "SQL Client", detail: "Read-only SQL client for Postgres, MySQL, and SQLite" },
  { id: "postman", label: "Postman", detail: "Construct and send REST API requests to any endpoint" },
  { id: "writing-agent", label: "Writing Agent", detail: "AI helper to clean grammar, style and tone of text" },
  { id: "subapp8", label: "Module 8", detail: "Reserved slot" },
  { id: "subapp9", label: "Module 9", detail: "Reserved slot" },
  { id: "subapp10", label: "Module 10", detail: "Reserved slot" },
];

function App() {
  const initialNavigation = readInitialNavigation();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auraflow_pin_token"));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeApp, setActiveApp] = useState<number | null>(initialNavigation.activeApp);
  const [activeSubapp, setActiveSubapp] = useState<AppOneSubappId | null>(initialNavigation.activeSubapp);

  useEffect(() => {
    updateNavigationPath(activeApp, activeSubapp);
  }, [activeApp, activeSubapp]);

  useEffect(() => {
    const onPopState = () => {
      const navigation = parseNavigationFromPath(window.location.pathname);
      setActiveApp(navigation.activeApp);
      setActiveSubapp(navigation.activeSubapp);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleLogout = () => {
    playBeep("error");
    localStorage.removeItem("auraflow_pin_token");
    setToken(null);
    setIsAuthenticated(false);
    setIsUnlocked(false);
    setActiveApp(null);
    setActiveSubapp(null);
    clearNavigationPath();
  };

  const renderSubappPlaceholder = (title: string) => (
    <div className="w-full max-w-3xl flex flex-col items-center animate-scale-up px-2">
      <ModuleHeaderBar
        title={title}
        onBack={() => setActiveSubapp(null)}
      />
      <div className="flex min-h-[280px] w-full flex-col items-center justify-center border border-white/10 bg-white/[0.02] p-8">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-white/80 font-semibold">Under development</p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-zinc-600">Coming soon</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden flex flex-col font-sans select-none">
      
      {/* Decorative ambient glowing grids behind blur */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-white/[0.04] rounded-full blur-[100px] pointer-events-none animate-pulse-glow" />
      <div 
        className="absolute inset-0 opacity-[0.01] pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]"
      />

      {/* 1. Fullscreen PIN Security Overlay */}
      <PinLockScreen
        token={token}
        setToken={setToken}
        isAuthenticated={isAuthenticated}
        setIsAuthenticated={setIsAuthenticated}
        isUnlocked={isUnlocked}
        setIsUnlocked={setIsUnlocked}
      />

      {/* 2. App Subpages Overlay (Absolute overlay to keep the canvas mounted) */}
      {isAuthenticated && activeApp !== null && (
        <div
          className={cn(
            "absolute inset-0 z-30 flex flex-col items-stretch bg-black p-3 font-sans justify-start sm:p-6",
            (activeSubapp === "nosql-client" || activeSubapp === "subapp4" || activeSubapp === "postman" || activeSubapp === "writing-agent") || activeApp === 3
              ? "overflow-hidden"
              : "overflow-x-hidden overflow-y-auto"
          )}
        >
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center">
                <LoadingSpinner />
              </div>
            }
          >
          {activeApp === 2 ? (
            <ClockTimerAlarm
              token={token}
              onBack={() => {
                setActiveSubapp(null);
                setActiveApp(null);
              }}
            />
          ) : activeApp === 1 ? (
            activeSubapp === "github-issue-analyser" ? (
              <GithubAnalyser
                onBack={() => setActiveSubapp(null)}
              />
            ) : activeSubapp === "expense-tracker" ? (
              <ExpenseTracker
                token={token!}
                onBack={() => {
                  playBeep("click");
                  setActiveSubapp(null);
                }}
                playBeep={playBeep}
              />
            ) : activeSubapp === "nosql-client" ? (
              <NoSqlClient
                token={token!}
                onBack={() => {
                  playBeep("click");
                  setActiveSubapp(null);
                }}
                playBeep={playBeep}
              />
            ) : activeSubapp === "subapp4" ? (
              <SqlClient
                token={token!}
                onBack={() => {
                  playBeep("click");
                  setActiveSubapp(null);
                }}
                playBeep={playBeep}
              />
            ) : activeSubapp === "postman" ? (
              <ErrorBoundary
                label="Postman"
                onBack={() => {
                  playBeep("click");
                  setActiveSubapp(null);
                }}
              >
                <PostmanClient
                  token={token!}
                  onBack={() => {
                    playBeep("click");
                    setActiveSubapp(null);
                  }}
                  playBeep={playBeep}
                />
              </ErrorBoundary>
            ) : activeSubapp === "writing-agent" ? (
              <WritingAgent
                token={token!}
                onBack={() => {
                  playBeep("click");
                  setActiveSubapp(null);
                }}
                playBeep={playBeep}
              />
            ) : activeSubapp && placeholderSubappIds.has(activeSubapp) ? (
              renderSubappPlaceholder(appOneSubapps.find((s) => s.id === activeSubapp)?.label ?? "Module")
            ) : (
              // Developer Utility Portal Main Page
              <div className="mx-auto flex w-full max-w-7xl animate-scale-up flex-col items-center px-2">
                <ModuleHeaderBar
                  title="Developer Utility Portal"
                  onBack={() => setActiveApp(null)}
                  backLabel="Dashboard"
                />
                <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                  {appOneSubapps.map((subapp) => (
                    <button
                      key={subapp.id}
                      type="button"
                      onClick={() => {
                        playBeep("click");
                        setActiveSubapp(subapp.id);
                      }}
                      className="group flex aspect-square min-h-24 flex-col items-center justify-center gap-2 border border-white/10 bg-white/[0.03] px-3 text-center transition-all duration-300 hover:-translate-y-1 hover:border-white/35 hover:bg-white/[0.08] hover:text-white focus-visible:border-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 sm:min-h-28 active:scale-[0.98]"
                    >
                      <span className="font-mono text-xs tracking-[0.18em] text-white/80 transition-transform duration-300 group-hover:scale-105 sm:text-sm font-semibold">
                        {subapp.label}
                      </span>
                      <span className="max-w-56 text-[10px] leading-4 text-zinc-600 font-mono">
                        {subapp.detail}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : activeApp === 3 ? (
            // Bookmark — website link saver
            <BookmarkManager
              token={token!}
              onBack={() => {
                playBeep("click");
                setActiveApp(null);
              }}
              playBeep={playBeep}
            />
          ) : (
            // Default App Subpages (APP 3 Under Development)
            <div className="w-full max-w-3xl flex flex-col items-center animate-scale-up px-2">
              <ModuleHeaderBar
                title={`Utility Module ${activeApp}`}
                onBack={() => setActiveApp(null)}
                backLabel="Dashboard"
              />
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
          </Suspense>
        </div>
      )}

      {/* 3. Main Authenticated Dashboard (Fullscreen Newton's Cradle) */}
      {isAuthenticated !== null && (
        <div 
          className={`w-screen h-screen relative bg-black transition-all duration-700 ${
            isAuthenticated && activeApp === null
              ? "blur-none scale-100 opacity-100" 
              : "blur-xl scale-95 opacity-20 pointer-events-none"
          }`}
        >
          {/* Faint, lock button in top-right corner */}
          {isAuthenticated && (
            <button
              onClick={handleLogout}
              className="absolute top-6 right-6 opacity-25 hover:opacity-100 transition-opacity p-2 text-white outline-none cursor-pointer z-20 active:scale-[0.9]"
              title="Lock Console"
            >
              <LogOut className="size-5" />
            </button>
          )}

          {/* Fullscreen Canvas Newton's Cradle Display */}
          <NewtonsCradle
            isAuthenticated={isAuthenticated}
            activeApp={activeApp}
            setActiveApp={setActiveApp}
          />
        </div>
      )}
    </div>
  );
}

export default App;
