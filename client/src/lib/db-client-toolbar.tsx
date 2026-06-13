import { Link2 } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { AppButton } from "@/components/ui/AppButton";

type Props = {
  showConnectionPanel: boolean;
  onToggleConnection: () => void;
  onBack: () => void;
};

export function DbClientToolbarButtons({
  showConnectionPanel,
  onToggleConnection,
  onBack,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AppButton
        variant="toolbar"
        active={showConnectionPanel}
        onClick={onToggleConnection}
        icon={<Link2 className="size-3.5" strokeWidth={1.5} />}
      >
        Connection
      </AppButton>
      <BackButton onClick={onBack} />
    </div>
  );
}
