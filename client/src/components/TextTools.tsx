import { Regex, GitCompare } from "lucide-react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { TabBar } from "./ui/TabBar";
import { RegexTool } from "./RegexTester";
import { DiffTool } from "./TextDiff";

type Props = { onBack: () => void };
type TabId = "regex" | "diff";

const TABS = [
	{ id: "regex" as const, label: "Regex", icon: <Regex className="size-3.5" /> },
	{ id: "diff" as const, label: "Diff", icon: <GitCompare className="size-3.5" /> },
];

export const TextTools: React.FC<Props> = ({ onBack }) => {
	const [tab, setTab] = usePersistentState<TabId>("auraflow_text_tools_tab", "regex");

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="Text Tools"
				subtitle="Test patterns & compare text"
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
			{tab === "regex" && <RegexTool />}
			{tab === "diff" && <DiffTool />}
		</div>
	);
};
