import { Clock, CalendarClock } from "lucide-react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { TabBar } from "./ui/TabBar";
import { EpochTool } from "./EpochConverter";
import { CronTool } from "./CronParser";

type Props = { onBack: () => void };
type TabId = "epoch" | "cron";

const TABS = [
	{ id: "epoch" as const, label: "Epoch", icon: <Clock className="size-3.5" /> },
	{ id: "cron" as const, label: "Cron", icon: <CalendarClock className="size-3.5" /> },
];

export const TimeTools: React.FC<Props> = ({ onBack }) => {
	const [tab, setTab] = usePersistentState<TabId>("auraflow_time_tools_tab", "epoch");

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="Time Tools"
				subtitle="Epoch converter & cron expression parser"
				onBack={onBack}
				backLabel="Home"
			/>
			<TabBar
				tabs={TABS}
				active={tab}
				onChange={(id) => {
					setTab(id as TabId);
					playBeep("click");
				}}
			/>
			{tab === "epoch" && <EpochTool />}
			{tab === "cron" && <CronTool />}
		</div>
	);
};
