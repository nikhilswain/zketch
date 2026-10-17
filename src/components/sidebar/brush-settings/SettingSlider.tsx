import type React from "react";
import { Slider } from "@/components/ui/slider";

interface SettingSliderProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (value: number) => void;
}

const SettingSlider: React.FC<SettingSliderProps> = ({
  label,
  value,
  display,
  min,
  max,
  step,
  hint,
  onChange,
}) => (
  <div className="space-y-2">
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900 tabular-nums">{display}</span>
    </div>
    <Slider
      value={[value]}
      onValueChange={(v) => onChange(v[0])}
      min={min}
      max={max}
      step={step}
      className="w-full"
    />
    {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
  </div>
);

export default SettingSlider;
