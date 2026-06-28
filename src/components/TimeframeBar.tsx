import type { Timeframe } from "../domain/types";
import { TIMEFRAMES } from "../domain/types";

type TimeframeBarProps = {
  value: Timeframe;
  onChange: (timeframe: Timeframe) => void;
};

export function TimeframeBar({ value, onChange }: TimeframeBarProps) {
  return (
    <nav className="timeframe-bar" aria-label="Timeframe selector">
      {TIMEFRAMES.map((timeframe) => (
        <button
          className={timeframe === value ? "is-active" : ""}
          key={timeframe}
          onClick={() => onChange(timeframe)}
          type="button"
        >
          {timeframe}
        </button>
      ))}
    </nav>
  );
}
