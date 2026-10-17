import type React from "react";
import { useEffect, useRef, useState } from "react";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { onBrushAssetsChanged } from "@/engine/stamp/assets";
import type { StrokeLike } from "@/engine/types";

export interface StrokeLook {
  brushStyle: string;
  color: string;
  size: number;
  opacity: number;
  angle: number;
  softness: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  taperStart: number;
  taperEnd: number;
}

interface StrokeCanvasProps {
  look: StrokeLook;
  width: number;
  height: number;
  amplitude: number;
  maxSize: number;
  className?: string;
}

function useAssetVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => onBrushAssetsChanged(() => setVersion((v) => v + 1)), []);
  return version;
}

const StrokeCanvas: React.FC<StrokeCanvasProps> = ({
  look,
  width,
  height,
  amplitude,
  maxSize,
  className,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const assets = useAssetVersion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const points: StrokeLike["points"] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      points.push({
        x: 10 + t * (width - 20),
        y: height / 2 + Math.sin(t * Math.PI * 2) * amplitude,
        pressure: 0.25 + 0.7 * Math.sin(t * Math.PI),
      });
    }
    const size = Math.min(look.size, maxSize);
    renderStroke(
      ctx,
      {
        id: `settings-preview-${look.brushStyle}`,
        points,
        color: look.color,
        size,
        opacity: look.opacity,
        brushStyle: look.brushStyle as StrokeLike["brushStyle"],
        timestamp: 0,
        angle: look.angle,
        softness: look.softness,
        thinning: look.thinning,
        smoothing: look.smoothing,
        streamline: look.streamline,
        taperStart: (look.taperStart * size) / Math.max(1, look.size),
        taperEnd: (look.taperEnd * size) / Math.max(1, look.size),
        input: "pen",
      },
      brushRegistry,
    );
  }, [
    assets,
    width,
    height,
    amplitude,
    maxSize,
    look.brushStyle,
    look.color,
    look.size,
    look.opacity,
    look.angle,
    look.softness,
    look.thinning,
    look.smoothing,
    look.streamline,
    look.taperStart,
    look.taperEnd,
  ]);

  return (
    <canvas
      ref={ref}
      style={{ width, height }}
      className={`block ${className ?? ""}`}
    />
  );
};

export default StrokeCanvas;
