import type React from "react";
import { useId, useRef, useState } from "react";
import {
  TRACK_H,
  TRACK_PAD,
  TRACK_W,
  trackPath,
  type TrackKind,
} from "./trackShapes";

interface StrokeTrackProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  kind: TrackKind;
  color?: string;
  compact?: boolean;
  dense?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}

function decimals(step: number) {
  const s = String(step);
  return s.includes(".") ? s.length - s.indexOf(".") - 1 : 0;
}

const StrokeTrack: React.FC<StrokeTrackProps> = ({
  label,
  value,
  min,
  max,
  step,
  display,
  kind,
  color = "#3F5A4B",
  compact,
  dense,
  hint,
  onChange,
}) => {
  const clipId = useId().replace(/:/g, "");
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const cancelled = useRef(false);

  const span = max - min || 1;
  const t = Math.max(0, Math.min(1, (value - min) / span));
  const fillW = TRACK_PAD + t * (TRACK_W - 2 * TRACK_PAD);
  const pct = (fillW / TRACK_W) * 100;
  const height = dense ? 20 : compact ? 30 : 40;

  const commit = (raw: number) => {
    const snapped = Math.round((raw - min) / step) * step + min;
    const clamped = Math.max(min, Math.min(max, snapped));
    const fixed = Number(clamped.toFixed(decimals(step)));
    if (fixed !== value) onChange(fixed);
  };

  const finishEditing = () => {
    if (editing === null) return;
    if (!cancelled.current && editing.trim() !== "") {
      const n = Number(editing);
      if (Number.isFinite(n)) commit(n);
    }
    cancelled.current = false;
    setEditing(null);
  };

  const fromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pad = (TRACK_PAD / TRACK_W) * rect.width;
    const u = (clientX - rect.left - pad) / (rect.width - 2 * pad);
    commit(min + Math.max(0, Math.min(1, u)) * span);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") commit(value + step * big);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") commit(value - step * big);
    else if (e.key === "Home") commit(min);
    else if (e.key === "End") commit(max);
    else if (e.key === "Enter") {
      cancelled.current = false;
      setEditing(String(value));
    }
    else return;
    e.preventDefault();
  };

  const tone = dragging ? "var(--zk-accent)" : hover ? "var(--zk-text)" : "var(--zk-track-tone)";
  const base = hover || dragging ? "var(--zk-track-hover)" : "var(--zk-track)";
  const shape = trackPath(kind);

  return (
    <div className={`flex flex-col font-ui select-none ${dense ? "gap-0.5" : "gap-1"}`}>
      <div className={`flex items-baseline justify-between ${dense ? "text-[11px]" : "text-[13px]"}`}>
        <span className="text-zk-text-2">{label}</span>
        {editing !== null ? (
          <input
            autoFocus
            type="number"
            value={editing}
            min={min}
            max={max}
            step={step}
            aria-label={`${label} value`}
            onChange={(e) => setEditing(e.target.value)}
            onBlur={finishEditing}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                finishEditing();
                trackRef.current?.focus();
              } else if (e.key === "Escape") {
                cancelled.current = true;
                setEditing(null);
                trackRef.current?.focus();
              }
            }}
            className="w-16 rounded-[3px] bg-zk-raised px-1 text-right text-[13px] font-semibold text-zk-text outline-none"
          />
        ) : (
          <span
            className="font-semibold text-zk-text tabular-nums cursor-text"
            title="Double-click to type a value"
            onDoubleClick={() => {
              cancelled.current = false;
              setEditing(String(value));
            }}
          >
            {display}
          </span>
        )}
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        onKeyDown={onKeyDown}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging) fromPointer(e.clientX);
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
        className="relative w-full cursor-ew-resize rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-zk-accent/60"
        style={{ height, touchAction: "none" }}
      >
        {kind === "opacity" ? (
          <div
            className="absolute inset-x-[1%] rounded-[2px]"
            style={{
              top: height / 2 - 6,
              height: 12,
              background: `linear-gradient(to right, transparent, ${color}), repeating-conic-gradient(var(--zk-checker-a) 0% 25%, var(--zk-checker-b) 0% 50%) 0 0 / 8px 8px`,
            }}
          />
        ) : (
          <svg
            aria-hidden="true"
            width="100%"
            height={height}
            viewBox={`0 0 ${TRACK_W} ${TRACK_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0"
          >
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={fillW} height={TRACK_H} />
              </clipPath>
            </defs>
            {shape.mode === "fill" ? (
              <>
                <path d={shape.d} fill={base} />
                <path d={shape.d} fill={tone} clipPath={`url(#${clipId})`} />
              </>
            ) : (
              <>
                <path
                  d={shape.d}
                  fill="none"
                  stroke={base}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={shape.d}
                  fill="none"
                  stroke={tone}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  clipPath={`url(#${clipId})`}
                />
              </>
            )}
          </svg>
        )}
        <div
          className="absolute -translate-x-1/2 rounded-[1px]"
          style={{
            left: `${pct}%`,
            top: dragging ? 1 : 4,
            bottom: dragging ? 1 : 4,
            width: dragging ? 4 : 2,
            background: tone,
          }}
        />
        {(hover || dragging) && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-[3px] px-1.5 text-[11px] font-semibold tabular-nums"
            style={{
              left: `${pct}%`,
              top: -2,
              background: dragging ? "var(--zk-accent)" : "var(--zk-track)",
              color: dragging ? "var(--zk-on-accent)" : "var(--zk-text)",
            }}
          >
            {display}
          </div>
        )}
      </div>
      {hint && <span className="text-[11px] text-zk-muted">{hint}</span>}
    </div>
  );
};

export default StrokeTrack;
