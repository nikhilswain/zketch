import type React from "react";
import { useEffect, useState } from "react";
import { SortIcon } from "@/components/icons";
import { PAGE_MAX, PAGE_MIN, clampPageSide } from "@/utils/page";

interface PageSizeFormProps {
  width: number;
  height: number;
  onChange: (width: number, height: number) => void;
  onSubmit?: (width: number, height: number) => void;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function ratioLabel(width: number, height: number) {
  const g = gcd(width, height);
  const a = width / g;
  const b = height / g;
  if (a <= 32 && b <= 32) return `${a}:${b}`;
  return width >= height ? `${(width / height).toFixed(2)}:1` : `1:${(height / width).toFixed(2)}`;
}

const SizeField: React.FC<{
  label: string;
  value: number;
  onCommit: (v: number) => void;
  onSubmit?: (v: number) => void;
}> = ({ label, value, onCommit, onSubmit }) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = clampPageSide(Number(text));
    setText(String(n));
    onCommit(n);
  };
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zk-muted">{label}</span>
      <span className="flex h-9 w-[140px] items-center rounded-[4px] bg-zk-raised px-2.5 focus-within:ring-1 focus-within:ring-zk-accent">
        <input
          value={text}
          inputMode="numeric"
          aria-label={`${label} in pixels, ${PAGE_MIN} to ${PAGE_MAX}`}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const n = clampPageSide(Number(text));
              commit();
              onSubmit?.(n);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-zk-text tabular-nums outline-none"
        />
        <span className="text-[12px] text-zk-muted">px</span>
      </span>
    </label>
  );
};

const PageSizeForm: React.FC<PageSizeFormProps> = ({ width, height, onChange, onSubmit }) => {
  const box = 150;
  const k = Math.min(box / width, box / height);
  return (
    <div className="flex items-start gap-5">
      <div className="flex flex-col gap-3">
        <SizeField label="Width" value={width} onCommit={(w) => onChange(w, height)} onSubmit={(w) => onSubmit?.(w, height)} />
        <SizeField label="Height" value={height} onCommit={(h) => onChange(width, h)} onSubmit={(h) => onSubmit?.(width, h)} />
        <button
          type="button"
          onClick={() => onChange(height, width)}
          className="flex h-8 w-fit items-center gap-1.5 rounded-[4px] px-2 text-[12px] text-zk-text-2 hover:bg-zk-raised"
        >
          <SortIcon size={14} />
          Swap · {ratioLabel(width, height)}
        </button>
      </div>
      <div className="flex h-[170px] flex-1 items-center justify-center rounded-[4px] bg-[#1B1B1E]" aria-hidden="true">
        <div className="bg-[#ECEBE7] shadow-[0_4px_14px_rgba(0,0,0,0.4)]" style={{ width: width * k, height: height * k }} />
      </div>
    </div>
  );
};

export default PageSizeForm;
