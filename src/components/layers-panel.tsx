"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Layers,
  Merge,
  Focus,
  Eraser,
  Image as ImageIcon,
  Shapes as ShapesIcon,
} from "lucide-react";
import type { ILayer, IStrokeLayer } from "@/models/LayerModel";
import { getSnapshot } from "mobx-state-tree";
import { BlobStorageService } from "@/services/BlobStorageService";
import LayerAnimationControls from "@/components/layer-animation-controls";
import type { StrokeLike } from "@/engine";
import type { PlaybackState } from "@/engine/AnimationPlaybackEngine";

// Generate a small thumbnail preview of a layer's strokes (simplified for performance)
function generateLayerThumbnail(
  layerSnapshot: { strokes: readonly any[] },
  width: number = 48,
  height: number = 36,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Light background
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, width, height);

  const strokes = layerSnapshot.strokes;
  if (!strokes || strokes.length === 0) {
    return canvas.toDataURL();
  }

  // Calculate bounds - limit to first 50 strokes for performance
  const maxStrokesToCheck = Math.min(strokes.length, 50);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (let i = 0; i < maxStrokesToCheck; i++) {
    const stroke = strokes[i];
    for (const p of stroke.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!isFinite(minX)) return canvas.toDataURL();

  // Add padding and calculate scale
  const padding = 4;
  const contentWidth = maxX - minX || 1;
  const contentHeight = maxY - minY || 1;
  const scale = Math.min(
    (width - padding * 2) / contentWidth,
    (height - padding * 2) / contentHeight,
  );
  const offsetX =
    padding + (width - padding * 2 - contentWidth * scale) / 2 - minX * scale;
  const offsetY =
    padding + (height - padding * 2 - contentHeight * scale) / 2 - minY * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw strokes as simple lines (skip getStroke for performance)
  // Limit to first 30 strokes to avoid lag
  const maxStrokesToDraw = Math.min(strokes.length, 30);
  for (let i = 0; i < maxStrokesToDraw; i++) {
    const stroke = strokes[i];
    if (stroke.brushStyle === "eraser" || stroke.points.length < 2) continue;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(1, stroke.size * 0.5);
    ctx.globalAlpha = stroke.opacity ?? 1;

    const pts = stroke.points;
    ctx.moveTo(pts[0].x, pts[0].y);

    // Sample points for very long strokes
    const step = pts.length > 100 ? Math.floor(pts.length / 50) : 1;
    for (let j = step; j < pts.length; j += step) {
      ctx.lineTo(pts[j].x, pts[j].y);
    }
    ctx.stroke();
  }

  ctx.restore();
  return canvas.toDataURL();
}

function generateShapeThumbnail(
  snapshot: any,
  width: number = 48,
  height: number = 36,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, width, height);

  const padding = 6;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const x = padding;
  const y = padding;

  ctx.strokeStyle = snapshot.strokeColor ?? "#000000";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  switch (snapshot.shapeType) {
    case "circle":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "rectangle": {
      const r = 4;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      break;
    }
    case "diamond":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    case "triangle":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
  }
  ctx.stroke();
  return canvas.toDataURL();
}

interface LayerItemProps {
  layer: ILayer;
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
  renderVersion: number;
  onAnimationFrame?: (strokes: StrokeLike[]) => void;
  onAnimationStateChange?: (state: PlaybackState) => void;
}

const LayerItem: React.FC<LayerItemProps> = observer(
  ({
    layer,
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
    renderVersion,
    onAnimationFrame,
    onAnimationStateChange,
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(layer.name);
    const [showOpacity, setShowOpacity] = useState(false);
    const [showAnimation, setShowAnimation] = useState(false);
    const [thumbnail, setThumbnail] = useState<string>("");
    const thumbnailTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const layerIdRef = useRef(layer.id);

    // Update layerId ref when layer changes
    layerIdRef.current = layer.id;

    // Generate thumbnail when layer strokes change (debounced)
    // Use snapshot to avoid MST detachment issues during reordering
    const strokeCount =
      layer.type === "stroke" ? (layer as any).strokes.length : 0;
    const shapeSig =
      layer.type === "shape"
        ? `${(layer as any).shapeType}:${(layer as any).strokeColor}:${(layer as any).strokeWidth}:${(layer as any).cornerRadius}:${(layer as any).rotation}:${(layer as any).width}:${(layer as any).height}`
        : "";
    const layerId = layer.id;

    useEffect(() => {
      // Clear any pending thumbnail generation
      if (thumbnailTimeoutRef.current) {
        clearTimeout(thumbnailTimeoutRef.current);
      }

      // Debounce thumbnail generation to prevent hanging on rapid updates
      thumbnailTimeoutRef.current = setTimeout(async () => {
        try {
          // Use snapshot to avoid accessing detached MST nodes
          const snapshot = getSnapshot(layer) as any;

          // Handle image layers - get thumbnail from blob
          if (snapshot.type === "image" && snapshot.blobId) {
            const blobUrl = await BlobStorageService.getBlobUrl(
              snapshot.blobId,
            );
            if (blobUrl && layerIdRef.current === layerId) {
              setThumbnail(blobUrl);
            }
            return;
          }

          if (snapshot.type === "shape") {
            const thumb = generateShapeThumbnail(snapshot);
            if (layerIdRef.current === layerId) {
              setThumbnail(thumb);
            }
            return;
          }

          // Only generate thumbnails for stroke layers
          if (!snapshot.strokes) {
            if (layerIdRef.current === layerId) {
              setThumbnail("");
            }
            return;
          }
          const thumb = generateLayerThumbnail(snapshot);
          // Only update if this is still the same layer
          if (layerIdRef.current === layerId) {
            setThumbnail(thumb);
          }
        } catch (e) {
          // Layer may have been detached during reorder, ignore
          console.warn("Thumbnail generation skipped:", e);
        }
      }, 150);

      return () => {
        if (thumbnailTimeoutRef.current) {
          clearTimeout(thumbnailTimeoutRef.current);
        }
      };
    }, [layerId, strokeCount, shapeSig]);

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
        className={`group relative flex flex-col border-b border-border transition-colors ${
          isActive
            ? "bg-primary/10 border-l-2 border-l-primary"
            : "hover:bg-muted/50"
        } ${!layer.visible ? "opacity-50" : ""}`}
      >
        {/* Main Layer Row */}
        <div className="flex items-center gap-2 p-2">
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
            ) : layer.type === "shape" ? (
              <ShapesIcon className="w-5 h-5 text-muted-foreground" />
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
                  {layer.type === "stroke"
                    ? `${(layer as any).strokes?.length || 0} strokes`
                    : layer.type === "image"
                      ? "Image"
                      : `Shape — ${(layer as any).shapeType}`}
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
              className={`h-6 w-6 ${isFocused ? "bg-primary/20" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFocus();
              }}
              title={isFocused ? "Exit Focus Mode" : "Focus (Solo)"}
            >
              <Focus
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
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
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
                <Lock className="h-3.5 w-3.5 text-yellow-500" />
              ) : (
                <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>

            {/* More Options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="h-3.5 w-3.5 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onMoveUp} disabled={isLast}>
                  <ChevronUp className="h-3.5 w-3.5 mr-2" />
                  Move Up
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveDown} disabled={isFirst}>
                  <ChevronDown className="h-3.5 w-3.5 mr-2" />
                  Move Down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowOpacity(!showOpacity)}>
                  Opacity
                </DropdownMenuItem>
                {layer.type === "stroke" && (
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
                    layer.type !== "stroke" ||
                    (layer as any).strokes?.length === 0 ||
                    layer.locked
                  }
                  className="text-orange-600 focus:text-orange-600"
                >
                  <Eraser className="h-3.5 w-3.5 mr-2" />
                  Clear Layer
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  disabled={!canDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
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
              <span className="text-xs text-muted-foreground w-14">
                Opacity
              </span>
              <Slider
                value={[layer.opacity * 100]}
                onValueChange={([val]) => onOpacityChange(val / 100)}
                min={0}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-xs w-8 text-right">
                {Math.round(layer.opacity * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Animation Controls (expandable, only for stroke layers) */}
        {showAnimation && layer.type === "stroke" && (
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

interface ShapeGroupRowProps {
  count: number;
  expanded: boolean;
  containsActive: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

const ShapeGroupRow: React.FC<ShapeGroupRowProps> = ({
  count,
  expanded,
  containsActive,
  onToggle,
  children,
}) => {
  return (
    <div
      className={`border-b border-border ${
        containsActive && !expanded ? "bg-primary/5" : ""
      }`}
    >
      <div
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          title={expanded ? "Collapse shapes" : "Expand shapes"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </Button>
        <div className="w-12 h-9 rounded border border-border bg-muted/30 flex items-center justify-center flex-shrink-0">
          <ShapesIcon className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">Shapes</span>
          <div className="text-xs text-muted-foreground">
            {count} shape{count === 1 ? "" : "s"}
            {containsActive && !expanded && (
              <span className="ml-1 text-primary">• selected inside</span>
            )}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-l-2 border-l-primary/30 ml-2">{children}</div>
      )}
    </div>
  );
};

interface LayersPanelProps {
  className?: string;
  collapsed?: boolean;
  onAnimationFrame?: (layerId: string, strokes: StrokeLike[]) => void;
  onAnimationStateChange?: (layerId: string, state: PlaybackState) => void;
}

const LayersPanel: React.FC<LayersPanelProps> = observer(
  ({
    className = "",
    collapsed = false,
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

    if (collapsed) {
      return (
        <div className={`flex items-center justify-center p-2 ${className}`}>
          <Layers className="h-5 w-5 text-muted-foreground" />
        </div>
      );
    }

    // Reverse the layers for display (top layer first in UI)
    const displayLayers = [...canvasStore.layers].reverse();

    // Coalesce runs of consecutive shape layers into collapsible groups.
    type DisplayItem =
      | { kind: "single"; layer: ILayer }
      | { kind: "group"; layers: ILayer[]; key: string };

    const items: DisplayItem[] = useMemo(() => {
      const out: DisplayItem[] = [];
      let i = 0;
      while (i < displayLayers.length) {
        if (displayLayers[i].type === "shape") {
          let j = i;
          while (j < displayLayers.length && displayLayers[j].type === "shape") j++;
          const run = displayLayers.slice(i, j);
          if (run.length === 1) {
            out.push({ kind: "single", layer: run[0] });
          } else {
            out.push({ kind: "group", layers: run, key: run[0].id });
          }
          i = j;
        } else {
          out.push({ kind: "single", layer: displayLayers[i] });
          i++;
        }
      }
      return out;
      // displayLayers identity changes whenever layers mutate, so it's a fine dep.
    }, [displayLayers]);

    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Auto-expand a group when it contains the active or selected layer.
    useEffect(() => {
      const target = canvasStore.selectedLayerId ?? canvasStore.activeLayerId;
      if (!target) return;
      for (const item of items) {
        if (item.kind === "group" && item.layers.some((l) => l.id === target)) {
          setExpandedGroups((prev) => {
            if (prev.has(item.key)) return prev;
            const next = new Set(prev);
            next.add(item.key);
            return next;
          });
          return;
        }
      }
    }, [canvasStore.selectedLayerId, canvasStore.activeLayerId, items]);

    const toggleGroup = useCallback((key: string) => {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }, []);

    const renderLayerItem = (layer: ILayer) => {
      const actualIndex = canvasStore.layers.findIndex((l) => l.id === layer.id);
      return (
        <LayerItem
          key={layer.id}
          layer={layer}
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
          renderVersion={canvasStore.renderVersion}
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
        {/* Header */}
        <div className="flex items-center justify-between p-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span className="text-sm font-medium">Layers</span>
            {canvasStore.isFocusMode && (
              <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                Focus
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Add Layer Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => canvasStore.addLayer()}
              title="Add Layer"
            >
              <Plus className="h-4 w-4" />
            </Button>
            {/* Merge Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Merge Options"
                >
                  <Merge className="h-4 w-4" />
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
        </div>

        {/* Exit Focus Mode Button - shown when in focus mode */}
        {canvasStore.isFocusMode && (
          <div className="p-2 border-b border-border/50">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => canvasStore.unfocusLayer()}
            >
              <Focus className="h-3 w-3 mr-1" />
              Exit Focus Mode
            </Button>
          </div>
        )}

        {/* Layers List */}
        <div className="flex-1 overflow-y-auto max-h-72">
          {items.map((item) => {
            if (item.kind === "single") {
              return renderLayerItem(item.layer);
            }
            const expanded = expandedGroups.has(item.key);
            const containsActive = item.layers.some(
              (l) => l.id === canvasStore.activeLayerId,
            );
            return (
              <ShapeGroupRow
                key={item.key}
                count={item.layers.length}
                expanded={expanded}
                containsActive={containsActive}
                onToggle={() => toggleGroup(item.key)}
              >
                {expanded && item.layers.map(renderLayerItem)}
              </ShapeGroupRow>
            );
          })}
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
