import type React from "react";
import { useEffect, useRef } from "react";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { onBrushAssetsChanged } from "@/engine/stamp/assets";
import { renderStroke } from "@/engine/render/renderStroke";
import { LOOK_BRUSHES } from "@/engine/render/sketchy";
import type { ElementLook } from "@/engine/types";

const LOOKS: { id: ElementLook; label: string }[] = [
  { id: "clean", label: "Clean" },
  { id: "sketchy", label: "Sketchy" },
  { id: "pencil", label: "Pencil" },
  { id: "crayon", label: "Crayon" },
  { id: "charcoal", label: "Charcoal" },
];

const W = 40;
const H = 18;

const Preview: React.FC<{ look: ElementLook; color: string }> = ({ look, color }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const points = Array.from({ length: 13 }, (_, i) => ({
        x: 4 + (i / 12) * (W - 8),
        y: H / 2 + Math.sin((i / 12) * Math.PI * 1.6) * 3.5,
        pressure: 0.5,
      }));
      if (look === "clean") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        return;
      }
      const spec = LOOK_BRUSHES[look];
      renderStroke(
        ctx,
        {
          id: `look-${look}`,
          points,
          color,
          size: 2.5 * spec.scale,
          opacity: 1,
          brushStyle: spec.brush,
          timestamp: 0,
          thinning: 0.3,
          smoothing: 0.4,
          streamline: 0,
          taperStart: 3,
          taperEnd: 4,
          input: "pen",
        },
        brushRegistry,
      );
    };
    draw();
    return onBrushAssetsChanged(draw);
  }, [look, color]);

  return <canvas ref={ref} aria-hidden="true" style={{ width: W, height: H }} />;
};

const LookPicker: React.FC<{ value: ElementLook | null; onPick: (look: ElementLook) => void }> = ({ value, onPick }) => (
  <div role="radiogroup" aria-label="Look" className="grid grid-cols-5 gap-1">
    {LOOKS.map((l) => {
      const on = value === l.id;
      return (
        <button
          key={l.id}
          role="radio"
          aria-checked={on}
          title={l.label}
          onClick={() => onPick(l.id)}
          className={`flex flex-col items-center gap-0.5 rounded-[4px] px-0.5 pt-1.5 pb-1 transition-colors ${
            on ? "bg-zk-selected" : "bg-zk-raised hover:bg-zk-hover"
          }`}
        >
          <Preview look={l.id} color={on ? "#FF6B5B" : "#ECEBE7"} />
          <span className={`text-[10px] font-semibold ${on ? "text-zk-accent" : "text-zk-text-2"}`}>{l.label}</span>
        </button>
      );
    })}
  </div>
);

export default LookPicker;
