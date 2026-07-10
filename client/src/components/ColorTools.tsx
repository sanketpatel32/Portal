import { Palette, Pipette } from "lucide-react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { TabBar } from "./ui/TabBar";
import { PaletteTool } from "./ColorPalette";
import { GradientTool } from "./CssGradient";

type Props = { onBack: () => void };
type TabId = "palette" | "gradient";

const TABS = [
	{ id: "palette" as const, label: "Palette", icon: <Palette className="size-3.5" /> },
	{ id: "gradient" as const, label: "Gradient", icon: <Pipette className="size-3.5" /> },
];

export const ColorTools: React.FC<Props> = ({ onBack }) => {
	const [tab, setTab] = usePersistentState<TabId>("auraflow_color_tools_tab", "palette");

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="Color & CSS"
				subtitle="Palettes, harmonies, gradients & contrast"
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
			{tab === "palette" && <PaletteTool />}
			{tab === "gradient" && <GradientTool />}
		</div>
	);
};
