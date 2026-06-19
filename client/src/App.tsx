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
import { ModuleHeaderBar } from "./components/ui/ModuleHeaderBar";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { LoadingSpinner } from "./components/ui/LoadingSpinner";
import { cn } from "./lib/utils";
import { appIcons } from "./components/ui/AppIcons";

// Heavy subapps are code-split: each becomes its own lazy chunk loaded only when
// the user opens that tile. This keeps the initial PIN-screen payload small
// (React + PinLockScreen) instead of shipping the entire app
// (SQL/NoSQL/Postman/Expense/GitHub/Writing/Clock/Bookmark/Kanban/Cron
// + radix/day-picker) to every visitor up front.
const ClockTimerAlarm = lazy(() =>
	import("./components/ClockTimerAlarm").then((m) => ({
		default: m.ClockTimerAlarm,
	})),
);
const GithubAnalyser = lazy(() =>
	import("./components/GithubAnalyser").then((m) => ({
		default: m.GithubAnalyser,
	})),
);
const ExpenseTracker = lazy(() =>
	import("./components/ExpenseTracker").then((m) => ({
		default: m.ExpenseTracker,
	})),
);
const NoSqlClient = lazy(() =>
	import("./components/NoSqlClient").then((m) => ({ default: m.NoSqlClient })),
);
const SqlClient = lazy(() =>
	import("./components/SqlClient").then((m) => ({ default: m.SqlClient })),
);
const PostmanClient = lazy(() =>
	import("./components/PostmanClient").then((m) => ({
		default: m.PostmanClient,
	})),
);
const WritingAgent = lazy(() =>
	import("./components/WritingAgent").then((m) => ({
		default: m.WritingAgent,
	})),
);
const BookmarkManager = lazy(() =>
	import("./components/BookmarkManager").then((m) => ({
		default: m.BookmarkManager,
	})),
);
const KanbanBoard = lazy(() =>
	import("./components/KanbanBoard").then((m) => ({ default: m.KanbanBoard })),
);
const CronScheduler = lazy(() =>
	import("./components/CronScheduler").then((m) => ({
		default: m.CronScheduler,
	})),
);

const appOneSubapps: Array<{
	id: AppOneSubappId;
	label: string;
	detail: string;
}> = [
	{
		id: "github-issue-analyser",
		label: "GitHub Finder",
		detail: "Find open-source repos with open issues and contribution signals",
	},
	{
		id: "expense-tracker",
		label: "Expense Tracker",
		detail: "Track spending by category with command-line interactions",
	},
	{
		id: "nosql-client",
		label: "NoSQL Client",
		detail: "Browse, filter and edit MongoDB collections",
	},
	{
		id: "subapp4",
		label: "SQL Client",
		detail: "Read-only SQL client for Postgres, MySQL, and SQLite",
	},
	{
		id: "postman",
		label: "Postman",
		detail: "Construct and send REST API requests to any endpoint",
	},
	{
		id: "writing-agent",
		label: "Writing Agent",
		detail: "AI helper to clean grammar, style and tone of text",
	},
	{
		id: "subapp8",
		label: "Kanban Board",
		detail: "Drag-and-drop task board with copyable To Do list",
	},
	{
		id: "cron-scheduler",
		label: "Cron Trigger",
		detail: "Schedule API triggers and manage mock endpoints",
	},
	{
		id: "clock-calendar",
		label: "Time & Cal",
		detail: "Clock, timer, alarm and calendar in one view",
	},
	{
		id: "bookmark-manager",
		label: "Bookmark",
		detail: "Save and tag website links for quick recall",
	},
];

// Subapps that need a non-scrolling, overflow-hidden shell (they manage their
// own internal scroll areas).
const OVERFLOW_HIDDEN_SUBAPPS = new Set<AppOneSubappId>([
	"nosql-client",
	"subapp4",
	"postman",
	"writing-agent",
	"cron-scheduler",
	"bookmark-manager",
]);

function App() {
	const initialNavigation = readInitialNavigation();
	const [token, setToken] = useState<string | null>(() =>
		localStorage.getItem("auraflow_pin_token"),
	);
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
	const [isUnlocked, setIsUnlocked] = useState(false);
	const [activeApp, setActiveApp] = useState<number | null>(
		initialNavigation.activeApp,
	);
	const [activeSubapp, setActiveSubapp] = useState<AppOneSubappId | null>(
		initialNavigation.activeSubapp,
	);

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

	// Return to the portal grid (home) from any subapp.
	const goHome = () => {
		playBeep("click");
		setActiveSubapp(null);
		setActiveApp(null);
	};

	const openTile = (id: AppOneSubappId) => {
		playBeep("click");
		setActiveApp(1);
		setActiveSubapp(id);
	};

	// Whether a subapp (overlay) is currently open.
	const subappOpen = activeApp !== null;

	return (
		<div className="min-h-screen bg-black text-white relative overflow-hidden flex flex-col font-sans">
			{/* NOTE: no global `select-none` — it blocked selecting/copying output
          text (issue titles, comments, query results). Interactive controls
          that shouldn't be selectable (buttons, chips) opt in per-element
          with their own `select-none` utility class. */}

			{/* Decorative ambient glow + grid behind blur */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-white/[0.04] rounded-full blur-[100px] pointer-events-none animate-pulse-glow" />
			<div className="absolute inset-0 opacity-[0.01] pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

			{/* 1. Fullscreen PIN Security Overlay */}
			<PinLockScreen
				token={token}
				setToken={setToken}
				isAuthenticated={isAuthenticated}
				setIsAuthenticated={setIsAuthenticated}
				isUnlocked={isUnlocked}
				setIsUnlocked={setIsUnlocked}
			/>

			{/* 2. Main Authenticated Dashboard — the portal grid is the home screen.
          It stays mounted (behind a blur) when a subapp overlay is open, so
          returning home is instant and the blur transition still plays. */}
			{isAuthenticated !== null && (
				<div
					className={cn(
						"w-screen h-screen relative bg-black transition-all duration-700 overflow-y-auto",
						isAuthenticated && !subappOpen
							? "blur-none scale-100 opacity-100"
							: "blur-xl scale-95 opacity-20 pointer-events-none",
					)}
				>
					{isAuthenticated && (
						<div className="min-h-screen flex items-center justify-center p-3 sm:p-6">
							<div className="mx-auto flex w-full max-w-7xl animate-scale-up flex-col items-center px-2">
								<ModuleHeaderBar
									title="Developer Utility Portal"
									showBack={false}
									actions={
										<button
											type="button"
											onClick={handleLogout}
											title="Lock Console"
											className="flex items-center gap-2 border border-white/10 px-3 py-1.5 min-h-[36px] font-mono text-[13px] uppercase tracking-[0.18em] text-zinc-500 transition-app hover:border-white/30 hover:text-white cursor-pointer"
										>
											<LogOut className="size-3.5" strokeWidth={1.5} />
											Lock
										</button>
									}
								/>
								<div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
									{appOneSubapps.map((subapp) => {
										const Icon = appIcons[subapp.id];
										return (
											<button
												key={subapp.id}
												type="button"
												onClick={() => openTile(subapp.id)}
												className="group relative flex aspect-square min-h-24 flex-col items-center justify-center gap-2 overflow-hidden border border-white/10 bg-white/[0.03] px-3 text-center transition-all duration-300 hover:-translate-y-1 hover:border-white/35 hover:bg-white/[0.08] hover:text-white focus-visible:border-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 sm:min-h-28 active:scale-[0.98]"
											>
												{/* Icon glow on hover */}
												<div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
													<div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-16 rounded-full bg-white/5 blur-xl" />
												</div>

												{/* SVG Icon */}
												<div className="relative text-white/60 transition-all duration-300 group-hover:text-white/90 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]">
													{Icon ? <Icon /> : null}
												</div>

												<span className="relative font-mono text-xs tracking-[0.18em] text-white/80 transition-all duration-300 group-hover:scale-105 sm:text-sm font-semibold">
													{subapp.label}
												</span>
												<span className="relative max-w-56 text-[10px] leading-4 text-zinc-600 font-mono transition-colors duration-300 group-hover:text-zinc-500">
													{subapp.detail}
												</span>
											</button>
										);
									})}
								</div>
							</div>
						</div>
					)}

					{/* Faint lock button in top-right corner (redundant with header Lock
              on home, but kept for muscle-memory parity). */}
					{!subappOpen && (
						<button
							onClick={handleLogout}
							className="absolute top-6 right-6 opacity-25 hover:opacity-100 transition-opacity p-2 text-white outline-none cursor-pointer z-20 active:scale-[0.9]"
							title="Lock Console"
						>
							<LogOut className="size-5" />
						</button>
					)}
				</div>
			)}

			{/* 3. Subapp Overlay (sits above the blurred home grid) */}
			{isAuthenticated && subappOpen && (
				<div
					className={cn(
						"absolute inset-0 z-30 flex flex-col items-stretch bg-black p-3 font-sans justify-start sm:p-6",
						activeSubapp && OVERFLOW_HIDDEN_SUBAPPS.has(activeSubapp)
							? "overflow-hidden"
							: "overflow-x-hidden overflow-y-auto",
					)}
				>
					<Suspense
						fallback={
							<div className="flex flex-1 items-center justify-center">
								<LoadingSpinner />
							</div>
						}
					>
						{activeSubapp === "github-issue-analyser" ? (
							<GithubAnalyser onBack={goHome} />
						) : activeSubapp === "expense-tracker" ? (
							<ExpenseTracker
								token={token!}
								onBack={goHome}
								playBeep={playBeep}
							/>
						) : activeSubapp === "nosql-client" ? (
							<NoSqlClient token={token!} onBack={goHome} playBeep={playBeep} />
						) : activeSubapp === "subapp4" ? (
							<SqlClient token={token!} onBack={goHome} playBeep={playBeep} />
						) : activeSubapp === "postman" ? (
							<ErrorBoundary label="Postman" onBack={goHome}>
								<PostmanClient
									token={token!}
									onBack={goHome}
									playBeep={playBeep}
								/>
							</ErrorBoundary>
						) : activeSubapp === "writing-agent" ? (
							<WritingAgent
								token={token!}
								onBack={goHome}
								playBeep={playBeep}
							/>
						) : activeSubapp === "subapp8" ? (
							<KanbanBoard token={token!} onBack={goHome} playBeep={playBeep} />
						) : activeSubapp === "cron-scheduler" ? (
							<CronScheduler token={token!} onBack={goHome} />
						) : activeSubapp === "clock-calendar" ? (
							<ClockTimerAlarm token={token} onBack={goHome} />
						) : activeSubapp === "bookmark-manager" ? (
							<BookmarkManager
								token={token!}
								onBack={goHome}
								playBeep={playBeep}
							/>
						) : (
							// Unknown / stale subapp id — bail out to home.
							<div className="mx-auto flex w-full max-w-3xl flex-col items-center animate-scale-up px-2">
								<ModuleHeaderBar
									title="Unknown Module"
									onBack={goHome}
									backLabel="Home"
								/>
								<div className="flex min-h-[280px] w-full flex-col items-center justify-center border border-white/10 bg-white/[0.02] p-8">
									<p className="font-mono text-sm uppercase tracking-[0.22em] text-white/80 font-semibold">
										Module not found
									</p>
								</div>
							</div>
						)}
					</Suspense>
				</div>
			)}
		</div>
	);
}

export default App;
