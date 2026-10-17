import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { lastInputWasPen, resetStroke } from "@/utils/brushMemory";
import StrokeTrack from "../StrokeTrack";
import PanelFrame from "../PanelFrame";

const percent = (v: number) => `${Math.round(v * 100)}%`;

const StrokeBody: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const key = canvasStore.currentBrushStyle;
  const bs = canvasStore.brushSettings;
  const settings = brushRegistry.get(key)?.strokeSettings ?? [];
  const has = (s: string) => settings.includes(s as never);
  const set = (patch: Parameters<typeof canvasStore.setBrushSettings>[0]) => {
    if (canvasStore.activeTool !== "brush") canvasStore.setActiveTool("brush");
    canvasStore.setBrushSettings(patch);
  };

  if (key === "eraser") {
    return <p className="px-3 pb-3 text-[12px] text-zk-muted">Not used by the eraser.</p>;
  }

  const brushSpecific = key === "calligraphy" || key === "airbrush";
  if (!brushSpecific && settings.length === 0) {
    return <p className="px-3 pb-3 text-[12px] text-zk-muted">This brush has no stroke settings.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-3 pb-3">
      {key === "calligraphy" && (
        <StrokeTrack compact kind="flat" label="Nib angle" value={bs.angle} display={`${bs.angle}°`} min={0} max={180} step={1} onChange={(v) => set({ angle: v })} />
      )}
      {key === "airbrush" && (
        <StrokeTrack compact kind="flat" label="Softness" value={bs.softness} display={percent(bs.softness)} min={0} max={1} step={0.05} onChange={(v) => set({ softness: v })} />
      )}
      {has("variation") && (
        <StrokeTrack
          compact
          kind="variation"
          label="Width variation"
          value={bs.thinning}
          display={percent(bs.thinning)}
          min={0}
          max={1}
          step={0.05}
          hint={lastInputWasPen() ? "From pen pressure" : "From drawing speed"}
          onChange={(v) => set({ thinning: v })}
        />
      )}
      {has("stabilizer") && (
        <StrokeTrack compact kind="stabilizer" label="Stabilizer" value={bs.streamline} display={percent(bs.streamline)} min={0} max={1} step={0.05} onChange={(v) => set({ streamline: v })} />
      )}
      {has("smoothing") && (
        <StrokeTrack compact kind="flat" label="Smoothing" value={bs.smoothing} display={percent(bs.smoothing)} min={0} max={1} step={0.05} onChange={(v) => set({ smoothing: v })} />
      )}
      {has("taper") && (
        <>
          <StrokeTrack compact kind="taper" label="Taper start" value={bs.taperStart} display={`${bs.taperStart} px`} min={0} max={100} step={1} onChange={(v) => set({ taperStart: v })} />
          <StrokeTrack compact kind="taper" label="Taper end" value={bs.taperEnd} display={`${bs.taperEnd} px`} min={0} max={100} step={1} onChange={(v) => set({ taperEnd: v })} />
        </>
      )}
    </div>
  );
});

const ResetStrokeAction: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const key = canvasStore.currentBrushStyle;
  if (key === "eraser") return null;
  return (
    <button onClick={() => resetStroke(canvasStore, key)} className="text-[11px] text-zk-muted hover:text-zk-text">
      Reset
    </button>
  );
});

const StrokePanel: React.FC = () => (
  <PanelFrame id="stroke" title="Stroke" actions={<ResetStrokeAction />}>
    <StrokeBody />
  </PanelFrame>
);

export default StrokePanel;
