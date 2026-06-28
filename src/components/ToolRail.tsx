import { Crosshair, Minus, Ruler, Slash, Trash2 } from "lucide-react";
import type { DrawingMode } from "./TradingChart";

type ToolRailProps = {
  mode: DrawingMode;
  drawingCount: number;
  onModeChange: (mode: DrawingMode) => void;
  onClear: () => void;
};

const TOOLS: Array<{
  mode: DrawingMode;
  label: string;
  icon: typeof Crosshair;
}> = [
  { mode: "cursor", label: "Cursor", icon: Crosshair },
  { mode: "trend", label: "Trend line", icon: Slash },
  { mode: "horizontal", label: "Horizontal price", icon: Minus },
  { mode: "measure", label: "Measure", icon: Ruler },
];

export function ToolRail({
  mode,
  drawingCount,
  onModeChange,
  onClear,
}: ToolRailProps) {
  return (
    <div className="tool-rail" aria-label="Chart drawing tools">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            aria-label={tool.label}
            className={tool.mode === mode ? "is-active" : ""}
            key={tool.mode}
            onClick={() => onModeChange(tool.mode)}
            title={tool.label}
            type="button"
          >
            <Icon size={17} />
          </button>
        );
      })}
      <button
        aria-label="Clear drawings"
        disabled={drawingCount === 0}
        onClick={onClear}
        title="Clear drawings"
        type="button"
      >
        <Trash2 size={17} />
      </button>
    </div>
  );
}
