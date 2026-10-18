import type React from "react";
import { useEffect, useRef, useState } from "react";

interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function hexToHsv(hex: string): Hsv {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to = (u: number) =>
    Math.round((u + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

interface HsvPickerProps {
  value: string;
  onChange: (hex: string) => void;
  size?: number | "fill";
}

const HsvPicker: React.FC<HsvPickerProps> = ({ value, onChange, size = 132 }) => {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value.replace("#", "").toUpperCase());
  const lastEmitted = useRef(value.toUpperCase());
  const square = useRef<HTMLDivElement>(null);
  const hue = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.toUpperCase() === lastEmitted.current) return;
    const next = hexToHsv(value);
    setHsv((prev) => ({ ...next, h: next.s === 0 ? prev.h : next.h }));
    setHexText(value.replace("#", "").toUpperCase());
    lastEmitted.current = value.toUpperCase();
  }, [value]);

  const emit = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexText(hex.slice(1));
    lastEmitted.current = hex;
    onChange(hex);
  };

  const dragSquare = (e: React.PointerEvent) => {
    const r = square.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    emit({ ...hsv, s, v });
  };

  const dragHue = (e: React.PointerEvent) => {
    const r = hue.current?.getBoundingClientRect();
    if (!r) return;
    const h = Math.max(0, Math.min(359.9, ((e.clientX - r.left) / r.width) * 360));
    emit({ ...hsv, h });
  };

  const pointer = (fn: (e: React.PointerEvent) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      fn(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) fn(e);
    },
  });

  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="flex flex-col gap-2" style={{ width: size === "fill" ? "100%" : size }}>
      <div
        ref={square}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        tabIndex={0}
        {...pointer(dragSquare)}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.02;
          if (e.key === "ArrowLeft") emit({ ...hsv, s: Math.max(0, hsv.s - d) });
          else if (e.key === "ArrowRight") emit({ ...hsv, s: Math.min(1, hsv.s + d) });
          else if (e.key === "ArrowUp") emit({ ...hsv, v: Math.min(1, hsv.v + d) });
          else if (e.key === "ArrowDown") emit({ ...hsv, v: Math.max(0, hsv.v - d) });
          else return;
          e.preventDefault();
        }}
        className="relative cursor-crosshair rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-zk-accent/60"
        style={{
          ...(size === "fill" ? { aspectRatio: "1 / 0.78" } : { height: Math.round(size * 0.78) }),
          touchAction: "none",
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})`,
        }}
      >
        <span
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(0,0,0,0.4)",
          }}
        />
      </div>
      <div
        ref={hue}
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
        {...pointer(dragHue)}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 30 : 5;
          if (e.key === "ArrowLeft") emit({ ...hsv, h: (hsv.h - d + 360) % 360 });
          else if (e.key === "ArrowRight") emit({ ...hsv, h: (hsv.h + d) % 360 });
          else return;
          e.preventDefault();
        }}
        className="relative h-2.5 cursor-ew-resize rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-zk-accent/60"
        style={{
          touchAction: "none",
          background:
            "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
      >
        <span
          className="pointer-events-none absolute top-[-2px] bottom-[-2px] w-[3px] -translate-x-1/2 rounded-[1px] bg-white"
          style={{ left: `${(hsv.h / 360) * 100}%`, boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }}
        />
      </div>
      <label className="flex h-7 items-center gap-1 rounded-[4px] bg-zk-raised px-2 text-[12px] text-zk-muted">
        #
        <input
          aria-label="Hex colour"
          value={hexText}
          maxLength={6}
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
            setHexText(t);
            if (t.length === 6) emit(hexToHsv(`#${t}`));
          }}
          onBlur={() => {
            if (hexText.length === 3) {
              const full = hexText.split("").map((c) => c + c).join("");
              setHexText(full);
              emit(hexToHsv(`#${full}`));
            } else if (hexText.length !== 6) {
              setHexText(value.replace("#", "").toUpperCase());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-full bg-transparent font-semibold tabular-nums text-zk-text outline-none"
        />
      </label>
    </div>
  );
};

export default HsvPicker;
