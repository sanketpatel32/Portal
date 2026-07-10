import { Dices, KeyRound } from "lucide-react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { playBeep } from "@/lib/audio";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { TabBar } from "./ui/TabBar";
import { PasswordTool } from "./PasswordGenerator";
import { UuidTool } from "./UuidGenerator";

type Props = { onBack: () => void };
type TabId = "password" | "uuid";

const TABS = [
	{ id: "password" as const, label: "Password", icon: <KeyRound className="size-3.5" /> },
	{ id: "uuid" as const, label: "UUID", icon: <Dices className="size-3.5" /> },
];

export const GeneratorTools: React.FC<Props> = ({ onBack }) => {
	const [tab, setTab] = usePersistentState<TabId>("auraflow_generators_tab", "password");

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar
				title="Generators"
				subtitle="Secure passwords & bulk ID generation"
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
			{tab === "password" && <PasswordTool />}
			{tab === "uuid" && <UuidTool />}
		</div>
	);
};
