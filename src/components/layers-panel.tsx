"use client";

import { isShapeElement, isStrokeElement } from "@/engine/types";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { useSortableList } from "@/hooks/useSortableList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StrokeTrack from "@/components/studio/StrokeTrack";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EraserIcon,
  EyeIcon,
  EyeOffIcon,
  FocusIcon,
  GripIcon,
  ImageIcon,
  LayersIcon,
  LockIcon,
  MergeIcon,
  MoreIcon,
  PlusIcon,
  ShapesIcon,
  TrashIcon,
  UnlockIcon,
} from "@/components/icons";
import type { ILayer, IStrokeLayer } from "@/models/LayerModel";
import { getSnapshot } from "mobx-state-tree";
import { BlobStorageService } from "@/services/BlobStorageService";
import LayerAnimationControls from "@/components/layer-animation-controls";
import type { StrokeLike } from "@/engine";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { renderShape } from "@/engine/render/renderShape";
import type { PlaybackState } from "@/engine/AnimationPlaybackEngine";

// Generate a small thumbnail preview of a draw layer (strokes + shapes).
function generateDrawLayerThumbnail(
  layerSnapshot: { elements: readonly any[] },
  width: number = 48,
  height: number = 36,
  page: { x: number; y: number; width: number; height: number } | null = null,
): string {
  const SS = 3;
  const rw = width * SS;
  const rh = height * SS;
  const work = document.createElement("canvas");
  work.width = rw;
  work.height = rh;
  const ctx = work.getContext("2d");
  if (!ctx) return "";

  const finish = () => {
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const outCtx = out.getContext("2d");
    if (!outCtx) return work.toDataURL();
    outCtx.drawImage(work, 0, 0, width, height);
    return out.toDataURL();
  };

  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, rw, rh);

  const elements = layerSnapshot.elements;
  if (page) {
    const pad = 2 * SS;
    const k = Math.min((rw - pad * 2) / page.width, (rh - pad * 2) / page.height);
    const px = (rw - page.width * k) / 2;
    const py = (rh - page.height * k) / 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px, py, page.width * k, page.height * k);
    ctx.beginPath();
    ctx.rect(px, py, page.width * k, page.height * k);
    ctx.clip();
    if (!elements || elements.length === 0) return finish();
    return drawElements(ctx, elements, rw, rh, px - page.x * k, py - page.y * k, k, finish);
  }
  if (!elements || elements.length === 0) return finish();

  // Compute bounds across all elements (sample-capped for perf).
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const cap = Math.min(elements.length, 50);
  for (let i = 0; i < cap; i++) {
    const el = elements[i];
    if (isShapeElement(el)) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    } else if (el.points) {
      for (const p of el.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  if (!isFinite(minX)) return finish();

  const padding = 4 * SS;
  const cw = maxX - minX || 1;
  const ch = maxY - minY || 1;
  const scale = Math.min(
    (rw - padding * 2) / cw,
    (rh - padding * 2) / ch,
  );
  const ox = padding + (rw - padding * 2 - cw * scale) / 2 - minX * scale;
  const oy = padding + (rh - padding * 2 - ch * scale) / 2 - minY * scale;
  return drawElements(ctx, elements, rw, rh, ox, oy, scale, finish);
}

function drawElements(
  ctx: CanvasRenderingContext2D,
  elements: readonly any[],
  rw: number,
  rh: number,
  ox: number,
  oy: number,
  scale: number,
  finish: () => string,
): string {
  const off = document.createElement("canvas");
  off.width = rw;
  off.height = rh;
  const offCtx = off.getContext("2d");
  if (offCtx) {
    offCtx.save();
    offCtx.translate(ox, oy);
    offCtx.scale(scale, scale);
    for (const el of elements) {
      if (isStrokeElement(el) && el.points && el.points.length >= 2) {
        renderStroke(offCtx, el as any, brushRegistry);
      }
    }
    offCtx.restore();
    ctx.drawImage(off, 0, 0);
  }

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  for (const el of elements) {
    if (isShapeElement(el)) renderShape(ctx, el as any);
  }
  ctx.restore();
  return finish();
}

type SortProps = ReturnType<ReturnType<typeof useSortableList>["itemProps"]>;

interface LayerItemProps {
  layer: ILayer;
  sortProps?: SortProps;
  isActive: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onToggleFocus: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onOpacityChange: (opacity: number) => void;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  onAnimationFrame?: (strokes: StrokeLike[]) => void;
  onAnimationStateChange?: (state: PlaybackState) => void;
}

export function useLayerThumbnail(layer: any): string {
  const canvasStore = useCanvasStore();
  const [thumbnail, setThumbnail] = useState<string>("");
  const thumbnailTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const layerIdRef = useRef(layer.id);

  // Update layerId ref when layer changes
  layerIdRef.current = layer.id;

  // Generate thumbnail when layer elements change (debounced).
  // Signature includes a count + a small mix of shape geometry to invalidate on tweaks.
  const elementCount =
    layer.type === "draw" ? (layer as any).elements.length : 0;
  const shapeSig =
    layer.type === "draw"
      ? (layer as any).elements
          .filter((e: any) => isShapeElement(e))
          .map(
            (e: any) =>
              `${e.shapeType}:${e.x}:${e.y}:${e.width}:${e.height}:${e.rotation}:${e.strokeColor}:${e.fillColor ?? ""}`,
          )
          .join("|")
      : "";
  const layerId = layer.id;

  useEffect(() => {
    // Clear any pending thumbnail generation
    if (thumbnailTimeoutRef.current) {
      clearTimeout(thumbnailTimeoutRef.current);
    }

    // Debounce thumbnail generation to prevent hanging on rapid updates
    const generate = async () => {
      if (canvasStore.isInteracting) {
        thumbnailTimeoutRef.current = setTimeout(generate, 150);
        return;
      }
      try {
        // Use snapshot to avoid accessing detached MST nodes
        const snapshot = getSnapshot(layer) as any;

        if (snapshot.type === "image" && snapshot.blobId) {
          const blobUrl = await BlobStorageService.getBlobUrl(
            snapshot.blobId,
          );
          if (blobUrl && layerIdRef.current === layerId) {
            setThumbnail(blobUrl);
          }
          return;
        }

        if (snapshot.type !== "draw" || !snapshot.elements) {
          if (layerIdRef.current === layerId) setThumbnail("");
          return;
        }

        const page = canvasStore.page;
        const thumb = generateDrawLayerThumbnail(
          snapshot,
          48,
          36,
          page ? { x: page.x, y: page.y, width: page.width, height: page.height } : null,
        );
        if (layerIdRef.current === layerId) setThumbnail(thumb);
      } catch (e) {
        // Layer may have been detached during reorder, ignore
        console.warn("Thumbnail generation skipped:", e);
      }
    };
    thumbnailTimeoutRef.current = setTimeout(generate, 150);

    return () => {
      if (thumbnailTimeoutRef.current) {
        clearTimeout(thumbnailTimeoutRef.current);
      }
    };
  }, [layerId, elementCount, shapeSig]);
  return thumbnail;
}


const LayerItem: React.FC<LayerItemProps> = observer(
  ({
    layer,
    sortProps,
    isActive,
    isFocused,
    onSelect,
    onToggleVisibility,
    onToggleLock,
    onToggleFocus,
    onRename,
    onDelete,
    onClear,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onOpacityChange,
    isFirst,
    isLast,
    canDelete,
    onAnimationFrame,
    onAnimationStateChange,
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(layer.name);
    const [showOpacity, setShowOpacity] = useState(false);
    const [showAnimation, setShowAnimation] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const canvasStore = useCanvasStore();
    const thumbnail = useLayerThumbnail(layer);

    const handleNameSubmit = () => {
      if (editName.trim()) {
        onRename(editName.trim());
      } else {
        setEditName(layer.name);
      }
      setIsEditing(false);
    };

    return (
      <div
        ref={sortProps?.ref}
        onPointerDown={isEditing ? undefined : sortProps?.onPointerDown}
        data-lifted={sortProps?.["data-lifted"]}
        style={sortProps?.style}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        className={`group mx-1.5 mb-0.5 flex cursor-grab select-none flex-col rounded-[4px] transition-colors data-lifted:cursor-grabbing data-lifted:bg-zk-raised data-lifted:shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${
          isActive ? "bg-zk-selected" : "hover:bg-zk-raised"
        } ${!layer.visible ? "opacity-50" : ""}`}
      >
        {/* Main Layer Row */}
        <div className="flex items-center gap-1.5 py-2 pr-2 pl-0.5">
          <span
            data-sort-handle
            aria-hidden="true"
            className="flex h-9 w-3 shrink-0 touch-none items-center justify-center text-[#5C5B60] opacity-0 transition-opacity group-hover:opacity-100 group-data-lifted:opacity-100"
          >
            <GripIcon size={12} />
          </span>
          {/* Thumbnail Preview */}
          <div
            className="w-12 h-9 rounded border border-border overflow-hidden cursor-pointer flex-shrink-0 bg-muted/30 flex items-center justify-center"
            onClick={onSelect}
          >
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={layer.name}
                className="w-full h-full object-cover"
              />
            ) : layer.type === "image" ? (
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            ) : null}
          </div>

          {/* Layer Info */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={onSelect}
            onDoubleClick={() => setIsEditing(true)}
          >
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value);
                }}
                onBlur={handleNameSubmit}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleNameSubmit();
                  if (e.key === "Escape") {
                    setEditName(layer.name);
                    setIsEditing(false);
                  }
                }}
                className="h-6 text-xs outline-none border-none "
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="flex flex-col">
                <span className="text-sm truncate font-medium">
                  {layer.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {layer.type === "image"
                    ? "Image"
                    : (() => {
                        const els = (layer as any).elements ?? [];
                        const strokes = els.filter(
                          (e: any) => isStrokeElement(e),
                        ).length;
                        const shapes = els.length - strokes;
                        if (strokes === 0 && shapes === 0) return "Empty";
                        const parts: string[] = [];
                        if (strokes > 0)
                          parts.push(`${strokes} stroke${strokes === 1 ? "" : "s"}`);
                        if (shapes > 0)
                          parts.push(`${shapes} shape${shapes === 1 ? "" : "s"}`);
                        return parts.join(" · ");
                      })()}
                </span>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-0.5">
            {/* Focus/Solo Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-6 w-6 ${isFocused ? "bg-zk-hover text-zk-accent" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFocus();
              }}
              title={isFocused ? "Exit Focus Mode" : "Focus (Solo)"}
            >
              <FocusIcon
                className={`h-3.5 w-3.5 ${
                  isFocused ? "text-primary" : "text-muted-foreground"
                }`}
              />
            </Button>

            {/* Visibility Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility();
              }}
              title={layer.visible ? "Hide Layer" : "Show Layer"}
            >
              {layer.visible ? (
                <EyeIcon className="h-3.5 w-3.5" />
              ) : (
                <EyeOffIcon className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>

            {/* Lock Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock();
              }}
              title={layer.locked ? "Unlock Layer" : "Lock Layer"}
            >
              {layer.locked ? (
                <LockIcon className="h-3.5 w-3.5 text-yellow-500" />
              ) : (
                <UnlockIcon className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>

            {/* More Options */}
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreIcon className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <CopyIcon className="h-3.5 w-3.5 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onMoveUp} disabled={isLast}>
                  <ChevronUpIcon className="h-3.5 w-3.5 mr-2" />
                  Move Up
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveDown} disabled={isFirst}>
                  <ChevronDownIcon className="h-3.5 w-3.5 mr-2" />
                  Move Down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowOpacity(!showOpacity)}>
                  Opacity
                </DropdownMenuItem>
                {layer.type === "draw" && (layer as any).strokeCount > 0 && (
                  <DropdownMenuItem
                    onClick={() => setShowAnimation(!showAnimation)}
                  >
                    Animation
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onClear}
                  disabled={
                    layer.type !== "draw" ||
                    ((layer as any).strokeCount ?? 0) === 0 ||
                    layer.locked
                  }
                  className="text-orange-600 focus:text-orange-600"
                >
                  <EraserIcon className="h-3.5 w-3.5 mr-2" />
                  Clear Strokes
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  disabled={!canDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <TrashIcon className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Opacity Slider (expandable) */}
        {showOpacity && (
          <div className="px-2 pb-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <StrokeTrack
                  compact
                  kind="flat"
                  label="Layer opacity"
                  value={Math.round(layer.opacity * 100)}
                  display={`${Math.round(layer.opacity * 100)}%`}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(val) => onOpacityChange(val / 100)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Animation Controls (expandable, only for draw layers with strokes) */}
        {showAnimation && layer.type === "draw" && (
          <LayerAnimationControls
            layer={layer as IStrokeLayer}
            onPlaybackFrame={onAnimationFrame}
            onPlaybackStateChange={onAnimationStateChange}
          />
        )}
      </div>
    );
  },
);

interface LayersPanelProps {
  className?: string;
  collapsed?: boolean;
  embedded?: boolean;
  onAnimationFrame?: (layerId: string, strokes: StrokeLike[]) => void;
  onAnimationStateChange?: (layerId: string, state: PlaybackState) => void;
}

export const LayersActions: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  return (
    <div className="flex items-center gap-1">
      {canvasStore.isFocusMode && (
        <span className="rounded-[3px] bg-zk-selected px-1.5 py-0.5 text-[10px] font-semibold text-zk-accent">
          Focus
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => canvasStore.addLayer()}
        title="Add Layer"
      >
        <PlusIcon className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Merge Options">
            <MergeIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => canvasStore.mergeVisibleLayers()}
            disabled={canvasStore.visibleLayers.length < 2}
          >
            Merge Visible
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => canvasStore.flattenAllLayers()}
            disabled={canvasStore.layerCount < 2}
          >
            Flatten All
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

const LayersPanel: React.FC<LayersPanelProps> = observer(
  ({
    className = "",
    collapsed = false,
    embedded = false,
    onAnimationFrame,
    onAnimationStateChange,
  }) => {
    const canvasStore = useCanvasStore();

    // Initialize layers if needed
    useEffect(() => {
      if (canvasStore.layers.length === 0) {
        canvasStore.initializeLayers();
      }
    }, [canvasStore]);

    // Reverse the layers for display (top layer first in UI)
    const displayLayers = [...canvasStore.layers].reverse();
    const { itemProps } = useSortableList(
      displayLayers.map((l) => l.id),
      (id, to) => canvasStore.moveLayer(id, canvasStore.layers.length - 1 - to),
    );

    if (collapsed) {
      return (
        <div className={`flex items-center justify-center p-2 ${className}`}>
          <LayersIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      );
    }


    const renderLayerItem = (layer: ILayer) => {
      const actualIndex = canvasStore.layers.findIndex((l) => l.id === layer.id);
      return (
        <LayerItem
          key={layer.id}
          layer={layer}
          sortProps={itemProps(layer.id)}
          isActive={layer.id === canvasStore.activeLayerId}
          isFocused={canvasStore.focusedLayerId === layer.id}
          onSelect={() => canvasStore.setActiveLayer(layer.id)}
          onToggleVisibility={() =>
            canvasStore.toggleLayerVisibility(layer.id)
          }
          onToggleLock={() => canvasStore.toggleLayerLock(layer.id)}
          onToggleFocus={() => canvasStore.focusLayer(layer.id)}
          onRename={(name) => canvasStore.renameLayer(layer.id, name)}
          onDelete={() => canvasStore.removeLayer(layer.id)}
          onClear={() => canvasStore.clearLayer(layer.id)}
          onMoveUp={() => canvasStore.moveLayerUp(layer.id)}
          onMoveDown={() => canvasStore.moveLayerDown(layer.id)}
          onDuplicate={() => canvasStore.duplicateLayer(layer.id)}
          onOpacityChange={(opacity) =>
            canvasStore.setLayerOpacity(layer.id, opacity)
          }
          isFirst={actualIndex === 0}
          isLast={actualIndex === canvasStore.layers.length - 1}
          canDelete={canvasStore.layerCount > 1}
          onAnimationFrame={(strokes) =>
            onAnimationFrame?.(layer.id, strokes)
          }
          onAnimationStateChange={(state) =>
            onAnimationStateChange?.(layer.id, state)
          }
        />
      );
    };

    return (
      <div
        className={`flex flex-col bg-background overflow-hidden ${className}`}
      >
        {!embedded && (
          <div className="flex items-center justify-between p-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <LayersIcon className="h-4 w-4" />
              <span className="text-sm font-medium">Layers</span>
            </div>
            <LayersActions />
          </div>
        )}

        {/* Exit Focus Mode Button - shown when in focus mode */}
        {canvasStore.isFocusMode && (
          <div className="p-2 border-b border-border/50">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => canvasStore.unfocusLayer()}
            >
              <FocusIcon className="h-3 w-3 mr-1" />
              Exit Focus Mode
            </Button>
          </div>
        )}

        {/* Layers List */}
        <div className={`flex-1 overflow-y-auto ${embedded ? "" : "max-h-72"}`}>
          {displayLayers.map(renderLayerItem)}
        </div>

        {/* Footer */}
        {canvasStore.activeLayer && (
          <div className="px-3 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            Drawing on:{" "}
            <span className="font-medium text-foreground">
              {canvasStore.activeLayer.name}
            </span>
            {canvasStore.activeLayer.locked && (
              <span className="ml-1 text-yellow-500">(Locked)</span>
            )}
          </div>
        )}
      </div>
    );
  },
);

export default LayersPanel;
