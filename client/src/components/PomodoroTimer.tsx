import { Play, Pause, RotateCcw, SkipForward, Coffee, Brain, Timer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { AppButton } from "./ui/AppButton";
import { AppInput } from "./ui/AppInput";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { SectionHeader } from "./ui/SectionHeader";

type Phase = "focus" | "short" | "long";

type Props = { onBack: () => void };

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

const phaseMeta: Record<Phase, { label: string; color: string; ring: string; icon: React.ReactNode }> = {
	focus: { label: "Focus", color: "text-emerald-400", ring: "stroke-emerald-400", icon: <Brain className="size-3.5" /> },
	short: { label: "Short Break", color: "text-sky-400", ring: "stroke-sky-400", icon: <Coffee className="size-3.5" /> },
	long: { label: "Long Break", color: "text-violet-400", ring: "stroke-violet-400", icon: <Coffee className="size-3.5" /> },
};

const StatCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
	<div className="flex flex-col items-center gap-1 py-1">
		<span className="font-mono text-lg text-white tabular-nums">{value}</span>
		<span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">{label}</span>
	</div>
);

const DurationField: React.FC<{ label: string; value: number; onChange: (n: number) => void }> = ({
	label,
	value,
	onChange,
}) => (
	<label className="flex flex-col gap-1.5">
		<span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">{label}</span>
		<AppInput
			type="number"
			min={1}
			max={180}
			value={value}
			onChange={(e) => onChange(Number(e.target.value))}
		/>
	</label>
);

export const PomodoroTimer: React.FC<Props> = ({ onBack }) => {
	const [focusMin, setFocusMin] = usePersistentState("auraflow_pomo_focus", 25);
	const [shortMin, setShortMin] = usePersistentState("auraflow_pomo_short", 5);
	const [longMin, setLongMin] = usePersistentState("auraflow_pomo_long", 15);
	const [sessionsCompleted, setSessionsCompleted] = usePersistentState("auraflow_pomo_sessions", 0);
	const [sessionDate, setSessionDate] = usePersistentState(
		"auraflow_pomo_session_date",
		new Date().toDateString(),
	);

	const [phase, setPhase] = useState<Phase>("focus");
	const [remaining, setRemaining] = useState<number>(() => Math.max(1, focusMin) * 60);
	const [isRunning, setIsRunning] = useState(false);
	const intervalRef = useRef<number | null>(null);
	const advancingRef = useRef(false);

	// Refs mirror the latest state so the interval/advance logic can read
	// fresh values without re-subscribing or risking stale closures.
	const phaseRef = useRef(phase);
	phaseRef.current = phase;
	const sessionsRef = useRef(sessionsCompleted);
	sessionsRef.current = sessionsCompleted;
	const focusMinRef = useRef(focusMin);
	focusMinRef.current = focusMin;
	const shortMinRef = useRef(shortMin);
	shortMinRef.current = shortMin;
	const longMinRef = useRef(longMin);
	longMinRef.current = longMin;

	const phaseSeconds = useCallback((p: Phase): number => {
		const m = p === "focus" ? focusMinRef.current : p === "short" ? shortMinRef.current : longMinRef.current;
		return Math.max(1, Math.floor(m)) * 60;
	}, []);

	// Reset the daily session counter when the calendar day rolls over.
	useEffect(() => {
		const today = new Date().toDateString();
		if (sessionDate !== today) {
			setSessionsCompleted(0);
			setSessionDate(today);
		}
	}, [sessionDate, setSessionsCompleted, setSessionDate]);

	// Ticking interval — subscribes only to isRunning.
	useEffect(() => {
		if (!isRunning) return;
		const id = window.setInterval(() => {
			setRemaining((r) => (r > 0 ? r - 1 : 0));
		}, 1000);
		intervalRef.current = id;
		return () => {
			window.clearInterval(id);
			intervalRef.current = null;
		};
	}, [isRunning]);

	const advance = useCallback(() => {
		const cur = phaseRef.current;
		let next: Phase;
		if (cur === "focus") {
			const newCount = sessionsRef.current + 1;
			sessionsRef.current = newCount;
			setSessionsCompleted(newCount);
			next = newCount % 4 === 0 ? "long" : "short";
		} else {
			next = "focus";
		}
		phaseRef.current = next;
		setPhase(next);
		setRemaining(phaseSeconds(next));
		playBeep("success");
	}, [phaseSeconds, setSessionsCompleted]);

	// Auto-advance (with beep) the moment the countdown hits zero.
	// advancingRef guards against any double-fire in Strict Mode.
	useEffect(() => {
		if (remaining > 0 || !isRunning) {
			advancingRef.current = false;
			return;
		}
		if (advancingRef.current) return;
		advancingRef.current = true;
		advance();
	}, [remaining, isRunning, advance]);

	const toggle = useCallback(() => {
		if (isRunning) {
			setIsRunning(false);
			return;
		}
		setRemaining((r) => (r > 0 ? r : phaseSeconds(phaseRef.current)));
		setIsRunning(true);
	}, [isRunning, phaseSeconds]);

	const reset = useCallback(() => {
		setIsRunning(false);
		advancingRef.current = false;
		setRemaining(phaseSeconds(phaseRef.current));
	}, [phaseSeconds]);

	// Resync the countdown when the ACTIVE phase's duration is edited while
	// paused. Without this, changing Focus 25→10 while paused at 24:59 keeps
	// the stale 24:59 until the user presses Reset. We only resync when the
	// changed duration belongs to the current phase, so editing the long-break
	// minutes while in focus mode doesn't clobber the focus countdown.
	useEffect(() => {
		if (isRunning) return;
		const changedMin =
			phase === "focus" ? focusMin : phase === "short" ? shortMin : longMin;
		const newSecs = Math.max(1, changedMin) * 60;
		setRemaining((r) => (r === newSecs ? r : newSecs));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [focusMin, shortMin, longMin]);

	// Skip jumps to the next phase WITHOUT counting a skipped focus session
	// as completed — only natural run-outs increment the counter.
	const skip = useCallback(() => {
		setIsRunning(false);
		advancingRef.current = false;
		const cur = phaseRef.current;
		let next: Phase;
		if (cur === "focus") {
			const c = sessionsRef.current;
			next = c > 0 && c % 4 === 0 ? "long" : "short";
		} else {
			next = "focus";
		}
		phaseRef.current = next;
		setPhase(next);
		setRemaining(phaseSeconds(next));
		playBeep("success");
	}, [phaseSeconds]);

	const clampMinutes = useCallback((n: number, fallback: number): number => {
		if (!Number.isFinite(n) || n < 1) return fallback;
		return Math.floor(n);
	}, []);

	const meta = phaseMeta[phase];
	const total = phaseSeconds(phase);
	const frac = total > 0 ? remaining / total : 0;
	const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
	const ss = (remaining % 60).toString().padStart(2, "0");
	const cyclePosition = sessionsRef.current % 4;

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="Pomodoro Timer"
				subtitle="Focus sessions with automatic break cycling"
				onBack={onBack}
				backLabel="Home"
			/>

			{/* Progress ring + readout */}
			<div className="flex flex-col items-center gap-6 py-4">
				<div className="relative flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
					<svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
						<circle
							cx="60"
							cy="60"
							r={RING_R}
							fill="none"
							stroke="rgba(255,255,255,0.08)"
							strokeWidth="2"
						/>
						<circle
							cx="60"
							cy="60"
							r={RING_R}
							fill="none"
							strokeWidth="2.5"
							strokeLinecap="round"
							className={cn(
								"transition-[stroke-dashoffset] duration-1000 ease-linear",
								meta.ring,
							)}
							strokeDasharray={RING_C}
							strokeDashoffset={RING_C * (1 - frac)}
						/>
					</svg>
					<div className="absolute flex flex-col items-center justify-center gap-2">
						<div
							className={cn(
								"flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.3em]",
								meta.color,
							)}
						>
							{meta.icon}
							{meta.label}
						</div>
						<div className="font-mono text-5xl font-extralight tracking-widest text-white tabular-nums sm:text-6xl">
							{mm}:{ss}
						</div>
						<div className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">
							{isRunning ? "Running" : remaining === 0 ? "Ready" : "Paused"}
						</div>
					</div>
				</div>

				{/* Controls */}
				<div className="flex flex-wrap items-center justify-center gap-2">
					<AppButton
						variant="primary"
						onClick={toggle}
						icon={isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
					>
						{isRunning ? "Pause" : "Start"}
					</AppButton>
					<AppButton
						variant="ghostSm"
						onClick={reset}
						icon={<RotateCcw className="size-3.5" />}
					>
						Reset
					</AppButton>
					<AppButton
						variant="ghostSm"
						onClick={skip}
						icon={<SkipForward className="size-3.5" />}
					>
						Skip
					</AppButton>
				</div>
			</div>

			{/* Session stats */}
			<div className="grid grid-cols-3 gap-2 border border-white/10 p-3">
				<StatCell label="Today" value={String(sessionsCompleted)} />
				<StatCell label="In Cycle" value={`${cyclePosition}/4`} />
				<StatCell
					label="Next"
					value={phase === "focus" ? (cyclePosition === 3 ? "Long" : "Short") : "Focus"}
				/>
			</div>

			{/* Durations */}
			<div>
				<SectionHeader
					title="Durations"
					icon={<Timer className="size-4" />}
					meta={
						<span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-600">
							Minutes
						</span>
					}
				/>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<DurationField
						label="Focus"
						value={focusMin}
						onChange={(n) => setFocusMin(clampMinutes(n, 1))}
					/>
					<DurationField
						label="Short Break"
						value={shortMin}
						onChange={(n) => setShortMin(clampMinutes(n, 1))}
					/>
					<DurationField
						label="Long Break"
						value={longMin}
						onChange={(n) => setLongMin(clampMinutes(n, 1))}
					/>
				</div>
				<p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600">
					Press reset to apply new durations to the current phase.
				</p>
			</div>
		</div>
	);
};

PomodoroTimer.displayName = "PomodoroTimer";
