import type React from "react";
import type { StrokeSettingKey } from "@/engine/types";
import SettingSlider from "./SettingSlider";

export interface StrokeValues {
  thinning: number;
  smoothing: number;
  streamline: number;
  taperStart: number;
  taperEnd: number;
}

interface StrokeSectionProps {
  settings: StrokeSettingKey[];
  values: StrokeValues;
  open: boolean;
  penInput: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<StrokeValues>) => void;
  onReset: () => void;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

const StrokeSection: React.FC<StrokeSectionProps> = ({
  settings,
  values,
  open,
  penInput,
  onToggle,
  onChange,
  onReset,
}) => {
  const has = (key: StrokeSettingKey) => settings.includes(key);
  return (
    <div className="pt-1">
      <div className="flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-700 transition-colors"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Stroke
        </button>
        {open && (
          <button
            onClick={onReset}
            className="text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
          >
            Reset
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-4 pt-3">
          {has("variation") && (
            <SettingSlider
              label="Width variation"
              value={values.thinning}
              display={percent(values.thinning)}
              min={0}
              max={1}
              step={0.05}
              hint={penInput ? "From pen pressure" : "From drawing speed"}
              onChange={(v) => onChange({ thinning: v })}
            />
          )}
          {has("stabilizer") && (
            <SettingSlider
              label="Stabilizer"
              value={values.streamline}
              display={percent(values.streamline)}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => onChange({ streamline: v })}
            />
          )}
          {has("smoothing") && (
            <SettingSlider
              label="Smoothing"
              value={values.smoothing}
              display={percent(values.smoothing)}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => onChange({ smoothing: v })}
            />
          )}
          {has("taper") && (
            <>
              <SettingSlider
                label="Taper start"
                value={values.taperStart}
                display={`${values.taperStart} px`}
                min={0}
                max={100}
                step={1}
                onChange={(v) => onChange({ taperStart: v })}
              />
              <SettingSlider
                label="Taper end"
                value={values.taperEnd}
                display={`${values.taperEnd} px`}
                min={0}
                max={100}
                step={1}
                onChange={(v) => onChange({ taperEnd: v })}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default StrokeSection;
