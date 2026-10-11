import type { ComponentProps } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Settings commit straight to the store on every pointer movement (no
// debounce) and useSetting re-renders synchronously, so the control itself
// holds no value state — only a cosmetic "active" flag for hover/focus.
type SettingsSliderProps = {
  /** Label shown inside the track. */
  label: string;
  /** Controlled value. */
  value: number;
  /** Called with the new value on drag, click, or key press. */
  onValueChange?: (value: number) => void;
  /**
   * Minimum value.
   * @defaultValue 0 */
  min?: number;
  /**
   * Maximum value.
   * @defaultValue 1 */
  max?: number;
  /**
   * Smallest increment.
   * @defaultValue 0.01 */
  step?: number;
  /** Format the displayed value. Defaults to `value.toFixed(...)` based on `step` */
  formatValue?: (value: number) => string;
  /** Whether to render the label inside the track. */
  showLabel?: boolean;
  className?: string;
  /** Accessible name. Falls back to `label` */
  "aria-label"?: string;
};

function decimalsForStep(step: number): number {
  const text = step.toString();
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

// Plain-DOM slider. It keeps the elastic slider's markup contract (`data-slot`
// hooks and the `--elastic-slider-*` variables that styles.css targets) but
// drops motion/react's springs, its per-frame rAF animations and its
// ResizeObserver "dodge" feedback loop, which Wallpaper Engine's CEF renderer
// cannot survive. A transparent native range input on top keeps pointer,
// keyboard and screen-reader behaviour native and free.
export function SettingsSlider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.01,
  formatValue,
  showLabel = true,
  className,
  "aria-label": ariaLabel,
}: SettingsSliderProps) {
  const [active, setActive] = useState(false);

  const span = max - min;
  const percent = span > 0 ? ((value - min) / span) * 100 : 0;
  const displayValue = formatValue
    ? formatValue(value)
    : value.toFixed(decimalsForStep(step));

  const discreteSteps = step > 0 ? span / step : 0;
  const hashMarkCount =
    discreteSteps <= 10 ? Math.max(0, Math.round(discreteSteps) - 1) : 9;
  const hashMarkPercent = (index: number): number =>
    discreteSteps <= 10 ? (((index + 1) * step) / span) * 100 : (index + 1) * 10;

  return (
    <div
      data-slot="elastic-slider"
      data-base-ui-swipe-ignore
      className={cn("relative", className)}
      style={{ height: "var(--elastic-slider-height, 2.25rem)" }}
    >
      <div
        data-slot="elastic-slider-track"
        data-active={active}
        className="absolute inset-0 overflow-hidden rounded-(--elastic-slider-radius) bg-(--elastic-slider-bg)"
      >
        {hashMarkCount > 0 && (
          <div
            data-slot="elastic-slider-hash-marks"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [transition:opacity_150ms_ease]"
            style={{ opacity: active ? 1 : 0 }}
          >
            {Array.from({ length: hashMarkCount }, (_, index) => (
              <div
                key={index}
                className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--elastic-slider-hash)"
                style={{ left: `${hashMarkPercent(index)}%` }}
              />
            ))}
          </div>
        )}

        <div
          data-slot="elastic-slider-fill"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 bg-(--elastic-slider-fill)"
          style={{ width: `${percent}%` }}
        />

        <div
          data-slot="elastic-slider-handle"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-(--elastic-slider-handle)"
          style={{
            left: `max(4px, calc(${percent}% - 8px))`,
            opacity: active ? 1 : 0.55,
          }}
        />

        {showLabel && (
          <span
            data-slot="elastic-slider-label"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm/none font-medium text-(--elastic-slider-label)"
          >
            {label}
          </span>
        )}

        <span
          data-slot="elastic-slider-value"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-sm/none font-medium text-(--elastic-slider-label)"
        >
          {displayValue}
        </span>

        <input
          type="range"
          aria-label={ariaLabel ?? label}
          min={min}
          max={max}
          step={step > 0 ? step : "any"}
          value={Number.isFinite(value) ? value : min}
          onChange={(event) => {
            const next = event.target.valueAsNumber;
            if (Number.isFinite(next)) onValueChange?.(next);
          }}
          onPointerDown={() => setActive(true)}
          onPointerUp={() => setActive(false)}
          onPointerCancel={() => setActive(false)}
          onMouseEnter={() => setActive(true)}
          onMouseLeave={() => setActive(false)}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

export function SettingsColorInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      {...props}
      type="color"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
