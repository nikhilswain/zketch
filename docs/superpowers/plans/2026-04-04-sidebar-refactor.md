# Sidebar Refactor — Floating Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic 546-line `slider.tsx` with a collapsed icon bar + floating draggable panels, and move undo/redo/clear to the top bar.

**Architecture:** Create `src/icons/` for 9 standalone SVG icon components with consistent `IconProps`. Create `src/components/sidebar/` with an icon bar component, a reusable `FloatingPanel` wrapper (draggable via pointer events), and 4 content panels (ToolSettings, Color, Background, TouchMode). Modify `canvas-view.tsx` to manage panel open/close state, render the new sidebar, add top bar actions, and delete the old `slider.tsx`.

**Tech Stack:** TypeScript, React, MobX (`observer`), Tailwind CSS, `@zzro/z-color-picker`

---

## File Structure

| File | Role | Change |
|---|---|---|
| `src/icons/ToolSettingsIcon.tsx` | SVG icon for tool settings | **Create** |
| `src/icons/PaletteIcon.tsx` | SVG icon for color palette | **Create** |
| `src/icons/BackgroundIcon.tsx` | SVG icon for background selector | **Create** |
| `src/icons/TouchModeIcon.tsx` | SVG icon for touch mode | **Create** |
| `src/icons/ImportIcon.tsx` | SVG icon for import | **Create** |
| `src/icons/ExportIcon.tsx` | SVG icon for export | **Create** |
| `src/icons/UndoIcon.tsx` | SVG icon for undo | **Create** |
| `src/icons/RedoIcon.tsx` | SVG icon for redo | **Create** |
| `src/icons/TrashIcon.tsx` | SVG icon for clear/trash | **Create** |
| `src/components/sidebar/index.tsx` | Icon bar — narrow vertical bar with tool icons | **Create** |
| `src/components/sidebar/FloatingPanel.tsx` | Reusable draggable panel wrapper | **Create** |
| `src/components/sidebar/ToolSettingsPanel.tsx` | Brush/eraser settings (reactive to active tool) | **Create** |
| `src/components/sidebar/ColorPanel.tsx` | Color picker + common colors | **Create** |
| `src/components/sidebar/BackgroundPanel.tsx` | Background selector (white/transparent/grid) | **Create** |
| `src/components/sidebar/TouchModePanel.tsx` | Touch mode selector (touch devices only) | **Create** |
| `src/components/canvas-view.tsx` | Main canvas orchestrator | **Modify** — replace sidebar, add top bar actions, panel state |
| `src/components/slider.tsx` | Old monolithic sidebar | **Delete** |

---

### Task 1: Create SVG icon components

**Files:**
- Create: `src/icons/ToolSettingsIcon.tsx`
- Create: `src/icons/PaletteIcon.tsx`
- Create: `src/icons/BackgroundIcon.tsx`
- Create: `src/icons/TouchModeIcon.tsx`
- Create: `src/icons/ImportIcon.tsx`
- Create: `src/icons/ExportIcon.tsx`
- Create: `src/icons/UndoIcon.tsx`
- Create: `src/icons/RedoIcon.tsx`
- Create: `src/icons/TrashIcon.tsx`

All icons share the same props interface. Each is a standalone TSX file with a placeholder `<svg>` — the user will replace SVG paths later. No shared base component.

- [ ] **Step 1: Create `src/icons/ToolSettingsIcon.tsx`**

```tsx
import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const ToolSettingsIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

export default ToolSettingsIcon;
```

- [ ] **Step 2: Create `src/icons/PaletteIcon.tsx`**

```tsx
import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const PaletteIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="13.5" cy="6.5" r="0.5" fill={color} />
    <circle cx="17.5" cy="10.5" r="0.5" fill={color} />
    <circle cx="8.5" cy="7.5" r="0.5" fill={color} />
    <circle cx="6.5" cy="12.5" r="0.5" fill={color} />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

export default PaletteIcon;
```

- [ ] **Step 3: Create `src/icons/BackgroundIcon.tsx`**

```tsx
import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const BackgroundIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);

export default BackgroundIcon;
```

- [ ] **Step 4: Create `src/icons/TouchModeIcon.tsx`**

```tsx
import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const TouchModeIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
    <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 16" />
  </svg>
);

export default TouchModeIcon;
```

- [ ] **Step 5: Create `src/icons/ImportIcon.tsx`**

```tsx
import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const ImportIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export default ImportIcon;
```

- [ ] **Step 6: Create `src/icons/ExportIcon.tsx`**

```tsx
import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const ExportIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export default ExportIcon;
```

- [ ] **Step 7: Create `src/icons/UndoIcon.tsx`**

```tsx
import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const UndoIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

export default UndoIcon;
```

- [ ] **Step 8: Create `src/icons/RedoIcon.tsx`**

```tsx
import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const RedoIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

export default RedoIcon;
```

- [ ] **Step 9: Create `src/icons/TrashIcon.tsx`**

```tsx
import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const TrashIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

export default TrashIcon;
```

- [ ] **Step 10: Verify build**

Run: `npm run build`
Expected: Build succeeds. Icons are created but not yet imported anywhere.

- [ ] **Step 11: Commit**

```bash
git add src/icons/
git commit -m "feat: add SVG icon components for sidebar refactor"
```

---

### Task 2: Create FloatingPanel wrapper

**Files:**
- Create: `src/components/sidebar/FloatingPanel.tsx`

This is the reusable draggable panel wrapper used by all floating panels. It handles positioning, dragging via pointer events on the header, and viewport clamping.

- [ ] **Step 1: Create `src/components/sidebar/FloatingPanel.tsx`**

```tsx
import type React from "react";
import { useState, useRef, useCallback, useEffect } from "react";

interface FloatingPanelProps {
  title: string;
  anchorIconIndex: number;
  onClose: () => void;
  children: React.ReactNode;
}

const ICON_BAR_WIDTH = 48;
const GAP = 8;
const ICON_SIZE = 48;
const TOP_OFFSET = 16; // py-4 on icon bar

const FloatingPanel: React.FC<FloatingPanelProps> = ({
  title,
  anchorIconIndex,
  onClose,
  children,
}) => {
  const defaultLeft = ICON_BAR_WIDTH + GAP;
  const defaultTop = TOP_OFFSET + anchorIconIndex * ICON_SIZE;

  const [position, setPosition] = useState({ x: defaultLeft, y: defaultTop });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, panelX: 0, panelY: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset position when panel opens (anchorIconIndex changes)
  useEffect(() => {
    setPosition({ x: defaultLeft, y: defaultTop });
  }, [anchorIconIndex]);

  const clampToViewport = useCallback((x: number, y: number) => {
    const panel = panelRef.current;
    if (!panel) return { x, y };

    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    return {
      x: Math.max(0, Math.min(x, vw - rect.width)),
      y: Math.max(0, Math.min(y, vh - rect.height)),
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panelX: position.x,
        panelY: position.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [position],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const newPos = clampToViewport(
        dragStartRef.current.panelX + dx,
        dragStartRef.current.panelY + dy,
      );
      setPosition(newPos);
    },
    [isDragging, clampToViewport],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={panelRef}
      className="fixed z-20 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[240px]"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header — drag handle */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b border-gray-100 select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {/* Content */}
      <div className="p-3">{children}</div>
    </div>
  );
};

export default FloatingPanel;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/FloatingPanel.tsx
git commit -m "feat: add FloatingPanel draggable wrapper component"
```

---

### Task 3: Create content panels (ToolSettings, Color, Background, TouchMode)

**Files:**
- Create: `src/components/sidebar/ToolSettingsPanel.tsx`
- Create: `src/components/sidebar/ColorPanel.tsx`
- Create: `src/components/sidebar/BackgroundPanel.tsx`
- Create: `src/components/sidebar/TouchModePanel.tsx`

These panels contain the settings UI extracted from `slider.tsx`. Each is a MobX `observer` component.

- [ ] **Step 1: Create `src/components/sidebar/ToolSettingsPanel.tsx`**

This panel reactively shows brush or eraser settings based on `canvasStore.currentBrushStyle`. When the user changes a brush/eraser setting while in pan mode, it calls `onForceDrawingMode` to switch back to drawing mode.

```tsx
import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

interface ToolSettingsPanelProps {
  isDrawingMode: boolean;
  onForceDrawingMode: () => void;
}

const ToolSettingsPanel: React.FC<ToolSettingsPanelProps> = observer(
  ({ isDrawingMode, onForceDrawingMode }) => {
    const canvasStore = useCanvasStore();

    const forceDrawing = () => {
      if (!isDrawingMode) onForceDrawingMode();
    };

    if (canvasStore.currentBrushStyle === "eraser") {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-600">
              Eraser Size:{" "}
              <span className="font-semibold">{canvasStore.eraserSize}px</span>
            </Label>
            <Slider
              value={[canvasStore.eraserSize]}
              onValueChange={(v) => {
                forceDrawing();
                canvasStore.setEraserSize(v[0]);
              }}
              min={1}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
        </div>
      );
    }

    // Brush settings (ink, spray, texture)
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-600">
            Brush Size:{" "}
            <span className="font-semibold">{canvasStore.currentSize}px</span>
          </Label>
          <Slider
            value={[canvasStore.currentSize]}
            onValueChange={(v) => {
              forceDrawing();
              canvasStore.setPenSize(v[0]);
            }}
            min={1}
            max={50}
            step={1}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-600">
            Opacity:{" "}
            {Math.round((canvasStore.brushSettings.opacity ?? 1) * 100)}%
          </Label>
          <Slider
            value={[canvasStore.brushSettings.opacity ?? 1]}
            onValueChange={(v) => {
              forceDrawing();
              canvasStore.setBrushSettings({ opacity: v[0] });
            }}
            min={0}
            max={1}
            step={0.05}
            className="w-full"
          />
        </div>

        {canvasStore.currentBrushStyle === "ink" && (
          <>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Thinning:{" "}
                {(canvasStore.brushSettings.thinning * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[canvasStore.brushSettings.thinning]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ thinning: v[0] });
                }}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Smoothing:{" "}
                {(canvasStore.brushSettings.smoothing * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[canvasStore.brushSettings.smoothing]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ smoothing: v[0] });
                }}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Streamline:{" "}
                {(canvasStore.brushSettings.streamline * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[canvasStore.brushSettings.streamline]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ streamline: v[0] });
                }}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Taper Start: {canvasStore.brushSettings.taperStart}
              </Label>
              <Slider
                value={[canvasStore.brushSettings.taperStart]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ taperStart: v[0] });
                }}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Taper End: {canvasStore.brushSettings.taperEnd}
              </Label>
              <Slider
                value={[canvasStore.brushSettings.taperEnd]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ taperEnd: v[0] });
                }}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
          </>
        )}
      </div>
    );
  },
);

export default ToolSettingsPanel;
```

- [ ] **Step 2: Create `src/components/sidebar/ColorPanel.tsx`**

```tsx
import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { ZColorPicker, type ZColorResult } from "@zzro/z-color-picker";
import "@zzro/z-color-picker/styles";

const commonColors = ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00"];

const ColorPanel: React.FC = observer(() => {
  const canvasStore = useCanvasStore();

  const handleColorChange = (color: ZColorResult<["hex"]>) => {
    canvasStore.setColor(color.hex);
  };

  return (
    <div className="space-y-3">
      <ZColorPicker
        initialColor={{ r: 0, g: 0, b: 0, a: 1 }}
        size={200}
        formats={["hex"]}
        onChange={handleColorChange}
        showColorRings={true}
        showBrightnessBar={true}
        colorRingsPalette={commonColors}
      />
    </div>
  );
});

export default ColorPanel;
```

- [ ] **Step 3: Create `src/components/sidebar/BackgroundPanel.tsx`**

```tsx
import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import type { BackgroundType } from "@/models/CanvasModel";

const backgroundOptions: { value: BackgroundType; label: string }[] = [
  { value: "white", label: "White" },
  { value: "transparent", label: "Transparent" },
  { value: "grid", label: "Grid" },
];

const BackgroundPanel: React.FC = observer(() => {
  const canvasStore = useCanvasStore();

  return (
    <div className="grid grid-cols-3 gap-2">
      {backgroundOptions.map((bg) => (
        <button
          key={bg.value}
          onClick={() => canvasStore.setBackground(bg.value)}
          className={`flex flex-col items-center gap-1 p-3 rounded border-2 transition-all text-xs ${
            canvasStore.background === bg.value
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {bg.label}
        </button>
      ))}
    </div>
  );
});

export default BackgroundPanel;
```

- [ ] **Step 4: Create `src/components/sidebar/TouchModePanel.tsx`**

```tsx
import type React from "react";
import { observer } from "mobx-react-lite";
import { useSettingsStore } from "@/hooks/useStores";

const touchModeOptions: {
  value: "auto" | "stylus-only" | "touch-draw";
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "stylus-only", label: "Stylus Only" },
  { value: "touch-draw", label: "Touch Draw" },
];

const TouchModePanel: React.FC = observer(() => {
  const settingsStore = useSettingsStore();

  return (
    <div className="grid grid-cols-3 gap-2">
      {touchModeOptions.map((tm) => (
        <button
          key={tm.value}
          onClick={() => settingsStore.setTouchMode(tm.value)}
          className={`flex flex-col items-center gap-1 p-3 rounded border-2 transition-all text-xs ${
            settingsStore.touchMode === tm.value
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {tm.label}
        </button>
      ))}
    </div>
  );
});

export default TouchModePanel;
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar/ToolSettingsPanel.tsx src/components/sidebar/ColorPanel.tsx src/components/sidebar/BackgroundPanel.tsx src/components/sidebar/TouchModePanel.tsx
git commit -m "feat: add floating panel content components (ToolSettings, Color, Background, TouchMode)"
```

---

### Task 4: Create the Icon Bar component

**Files:**
- Create: `src/components/sidebar/index.tsx`

The icon bar is a narrow 48px vertical bar fixed to the left edge. It renders icon buttons that toggle floating panels. Import and Export icons trigger callbacks directly (no panel).

- [ ] **Step 1: Create `src/components/sidebar/index.tsx`**

```tsx
import type React from "react";
import ToolSettingsIcon from "@/icons/ToolSettingsIcon";
import PaletteIcon from "@/icons/PaletteIcon";
import BackgroundIcon from "@/icons/BackgroundIcon";
import TouchModeIcon from "@/icons/TouchModeIcon";
import ImportIcon from "@/icons/ImportIcon";
import ExportIcon from "@/icons/ExportIcon";

interface IconBarProps {
  openPanels: Set<string>;
  onTogglePanel: (panelId: string) => void;
  onImport: () => void;
  onExport: () => void;
}

const hasTouchSupport =
  typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

interface IconButtonProps {
  isActive: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

const IconButton: React.FC<IconButtonProps> = ({
  isActive,
  onClick,
  title,
  children,
}) => (
  <button
    onClick={onClick}
    title={title}
    className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
      isActive
        ? "bg-blue-50 text-blue-600"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`}
  >
    {children}
  </button>
);

const IconBar: React.FC<IconBarProps> = ({
  openPanels,
  onTogglePanel,
  onImport,
  onExport,
}) => {
  return (
    <div className="fixed top-0 left-0 h-full w-12 bg-white/90 backdrop-blur-sm border-r border-gray-200 flex flex-col items-center py-4 gap-1 z-10">
      <IconButton
        isActive={openPanels.has("tool-settings")}
        onClick={() => onTogglePanel("tool-settings")}
        title="Tool Settings"
      >
        <ToolSettingsIcon width={20} height={20} />
      </IconButton>

      <IconButton
        isActive={openPanels.has("color")}
        onClick={() => onTogglePanel("color")}
        title="Color Palette"
      >
        <PaletteIcon width={20} height={20} />
      </IconButton>

      <IconButton
        isActive={openPanels.has("background")}
        onClick={() => onTogglePanel("background")}
        title="Background"
      >
        <BackgroundIcon width={20} height={20} />
      </IconButton>

      {hasTouchSupport && (
        <IconButton
          isActive={openPanels.has("touch-mode")}
          onClick={() => onTogglePanel("touch-mode")}
          title="Touch Mode"
        >
          <TouchModeIcon width={20} height={20} />
        </IconButton>
      )}

      <div className="w-6 border-t border-gray-200 my-1" />

      <IconButton isActive={false} onClick={onImport} title="Import Image">
        <ImportIcon width={20} height={20} />
      </IconButton>

      <IconButton isActive={false} onClick={onExport} title="Export">
        <ExportIcon width={20} height={20} />
      </IconButton>
    </div>
  );
};

export default IconBar;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/index.tsx
git commit -m "feat: add icon bar sidebar component"
```

---

### Task 5: Integrate into canvas-view.tsx — replace sidebar, add top bar actions, wire panels

**Files:**
- Modify: `src/components/canvas-view.tsx`

This is the integration task. Replace the old `Sidebar` import and rendering with the new `IconBar` + floating panels. Add undo/redo/clear buttons to the floating header. Remove `sidebarCollapsed` state. Add `openPanels` state and `togglePanel` handler. Move the clear confirmation modal here.

- [ ] **Step 1: Replace imports**

In `src/components/canvas-view.tsx`, find:

```typescript
import Sidebar from "./slider";
```

Replace with:

```typescript
import IconBar from "./sidebar";
import FloatingPanel from "./sidebar/FloatingPanel";
import ToolSettingsPanel from "./sidebar/ToolSettingsPanel";
import ColorPanel from "./sidebar/ColorPanel";
import BackgroundPanel from "./sidebar/BackgroundPanel";
import TouchModePanel from "./sidebar/TouchModePanel";
import UndoIcon from "@/icons/UndoIcon";
import RedoIcon from "@/icons/RedoIcon";
import TrashIcon from "@/icons/TrashIcon";
```

Also remove `ChevronRight` and `ChevronLeft` from the lucide-react import (they're no longer needed after we remove the sidebar collapse toggle — `ChevronRight` is still used by the layers panel, keep that one). The lucide import becomes:

```typescript
import { ArrowLeft, ChevronRight, Layers, Loader2, Check } from "lucide-react";
```

(`ChevronLeft` is used by the layers panel collapse button — check if it's still referenced. Looking at the existing code: `ChevronLeft` is used at line 538 for the layers panel collapse button, so keep it.)

Actually, looking more carefully at the current code:
- `ChevronRight` is used at line 449 (sidebar expand — being removed) and line 551 (layers panel collapse — keeping)
- `ChevronLeft` is used at line 538 (layers panel expand — keeping)

So keep both. The import stays as:

```typescript
import { ArrowLeft, ChevronRight, ChevronLeft, Layers, Loader2, Check } from "lucide-react";
```

- [ ] **Step 2: Replace sidebar state with panel state**

Find:

```typescript
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
```

Replace with:

```typescript
    const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());
    const [showClearModal, setShowClearModal] = useState(false);
```

- [ ] **Step 3: Add togglePanel handler**

After the `handleRename` function and before the autosave `useEffect`, add:

```typescript
    const togglePanel = (panelId: string) => {
      setOpenPanels((prev) => {
        const next = new Set(prev);
        if (next.has(panelId)) {
          next.delete(panelId);
        } else {
          next.add(panelId);
        }
        return next;
      });
    };

    const handleClear = () => {
      setShowClearModal(true);
    };

    const confirmClear = () => {
      canvasStore.clear();
      setShowClearModal(false);
    };

    const cancelClear = () => {
      setShowClearModal(false);
    };
```

- [ ] **Step 4: Replace the sidebar rendering in JSX**

Find the entire floating sidebar section (the `<div>` with the comment `{/* Floating sidebar */}`):

```tsx
        {/* Floating sidebar */}
        <div
          className={`fixed top-0 left-0 h-full transition-all duration-300 z-10 ${
            sidebarCollapsed ? "w-12" : "w-80"
          }`}
        >
          {sidebarCollapsed ? (
            <div className="w-12 bg-white/90 backdrop-blur-sm border-r border-gray-200 flex flex-col items-center py-4 h-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarCollapsed(false)}
                className="p-2"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="bg-white/90 backdrop-blur-sm border-r border-gray-200 h-full">
              <Sidebar
                onSave={handleSave}
                onExport={handleShowExportDialog}
                onImport={() => setShowImportDialog(true)}
                onCollapse={() => setSidebarCollapsed(true)}
                isDrawingMode={isDrawingMode}
                onForceDrawingMode={() => setIsDrawingMode(true)}
              />
            </div>
          )}
        </div>
```

Replace with:

```tsx
        {/* Icon bar + floating panels */}
        <IconBar
          openPanels={openPanels}
          onTogglePanel={togglePanel}
          onImport={() => setShowImportDialog(true)}
          onExport={handleShowExportDialog}
        />

        {openPanels.has("tool-settings") && (
          <FloatingPanel
            title={
              canvasStore.currentBrushStyle === "eraser"
                ? "Eraser Settings"
                : "Brush Settings"
            }
            anchorIconIndex={0}
            onClose={() => togglePanel("tool-settings")}
          >
            <ToolSettingsPanel
              isDrawingMode={isDrawingMode}
              onForceDrawingMode={() => setIsDrawingMode(true)}
            />
          </FloatingPanel>
        )}

        {openPanels.has("color") && (
          <FloatingPanel
            title="Color"
            anchorIconIndex={1}
            onClose={() => togglePanel("color")}
          >
            <ColorPanel />
          </FloatingPanel>
        )}

        {openPanels.has("background") && (
          <FloatingPanel
            title="Background"
            anchorIconIndex={2}
            onClose={() => togglePanel("background")}
          >
            <BackgroundPanel />
          </FloatingPanel>
        )}

        {openPanels.has("touch-mode") && (
          <FloatingPanel
            title="Touch Mode"
            anchorIconIndex={3}
            onClose={() => togglePanel("touch-mode")}
          >
            <TouchModePanel />
          </FloatingPanel>
        )}

        {/* Clear confirmation modal */}
        {showClearModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/20 backdrop-blur-sm">
            <div className="bg-white rounded shadow-lg p-6 w-80 border border-gray-200">
              <h3 className="text-lg font-semibold mb-4">
                Clear Entire Canvas?
              </h3>
              <p className="mb-6 text-sm text-gray-700">
                This will delete <strong>all layers and all strokes</strong>. A
                new empty layer will be created. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={cancelClear}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmClear}>
                  Clear All
                </Button>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 5: Add undo/redo/clear buttons to the floating header**

Find the closing `</div>` of the save status indicator in the floating header. The current header ends with:

```tsx
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            {saveStatus === "saving" && (
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
            )}
            {saveStatus === "saved" && (
              <Check className="w-4 h-4 text-green-500" />
            )}
          </div>
        </div>
```

Replace with:

```tsx
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            {saveStatus === "saving" && (
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
            )}
            {saveStatus === "saved" && (
              <Check className="w-4 h-4 text-green-500" />
            )}
          </div>

          <div className="w-px h-6 bg-gray-200" />

          <div className="flex items-center gap-1">
            <button
              onClick={() => canvasStore.undo()}
              disabled={!canvasStore.canUndo}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Undo"
            >
              <UndoIcon width={16} height={16} />
            </button>
            <button
              onClick={() => canvasStore.redo()}
              disabled={!canvasStore.canRedo}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Redo"
            >
              <RedoIcon width={16} height={16} />
            </button>
            <button
              onClick={handleClear}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-red-600 transition-colors"
              title="Clear Canvas"
            >
              <TrashIcon width={16} height={16} />
            </button>
          </div>
        </div>
```

- [ ] **Step 6: Remove unused `handleSave` from `useKeyboardShortcuts` call (optional cleanup)**

The `handleSave` is still valid for Ctrl+S. No change needed here — keep as is.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/canvas-view.tsx
git commit -m "feat: integrate icon bar, floating panels, and top bar actions into canvas-view"
```

---

### Task 6: Delete old slider.tsx

**Files:**
- Delete: `src/components/slider.tsx`

- [ ] **Step 1: Verify no remaining imports of slider.tsx**

Search the codebase for any remaining imports of `slider` or `Sidebar` from the old file:

Run: `grep -r "from.*slider" src/ --include="*.tsx" --include="*.ts"`

Expected: No results referencing `./slider` or `../slider` from any component. The only references should be `./ui/slider` (the shadcn Slider UI component) which is unrelated.

- [ ] **Step 2: Delete the file**

```bash
rm src/components/slider.tsx
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. No broken imports.

- [ ] **Step 4: Commit**

```bash
git add -u src/components/slider.tsx
git commit -m "refactor: delete old monolithic slider.tsx sidebar"
```

---

### Task 7: Final verification

**Files:**
- Possibly touch: any files from above if issues found

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Manual test checklist**

Run: `npm run dev`

Verify:
- [ ] Icon bar appears on left edge, narrow (~48px), always visible
- [ ] Clicking Tool Settings icon opens a floating panel beside it with brush/eraser settings
- [ ] Clicking the same icon again closes the panel
- [ ] Multiple panels can be open at the same time
- [ ] Panel headers are draggable — can move panels around the canvas
- [ ] Panels clamp to viewport bounds (can't drag off-screen)
- [ ] Switching between ink/eraser in the dock updates the Tool Settings panel content
- [ ] Color panel shows the ZColorPicker with common color rings
- [ ] Background panel shows White/Transparent/Grid boxes, clicking changes background
- [ ] Touch Mode panel appears only on touch devices
- [ ] Import icon opens the import dialog (no panel)
- [ ] Export icon opens the export dialog (no panel)
- [ ] Undo/Redo/Clear buttons appear in the top header bar
- [ ] Undo is disabled when nothing to undo, Redo when nothing to redo
- [ ] Clear button shows confirmation modal, confirming clears the canvas
- [ ] Autosave still works (draw strokes, wait, see spinner/checkmark)
- [ ] Keyboard shortcuts still work (Ctrl+Z undo, Ctrl+S save, etc.)

- [ ] **Step 3: Fix any issues found**

Address bugs discovered during testing.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: sidebar refactor integration fixes"
```
