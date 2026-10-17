"use client";

import { useEffect } from "react";
import { useCanvasStore } from "../hooks/useStores";
import { KeyBindingManager, KEY_BINDINGS } from "../utils/keyBindings";
import { lastBrush, selectBrush } from "../utils/brushMemory";
import { fitView, visibleCanvasCenter } from "@/utils/viewport";

export const useKeyboardShortcuts = (
  onSave?: () => void,
  onExport?: () => void,
  onToggleSidebar?: () => void,
  onToggleVault?: () => void
) => {
  const canvasStore = useCanvasStore();

  useEffect(() => {
    // Register all keyboard shortcut handlers
    KeyBindingManager.registerHandler("undo", () => canvasStore.undo());
    KeyBindingManager.registerHandler("redo", () => canvasStore.redo());
    KeyBindingManager.registerHandler("clearCanvas", () => {
      if (
        confirm(
          "Are you sure you want to clear the canvas? This action cannot be undone."
        )
      ) {
        canvasStore.clear();
      }
    });

    KeyBindingManager.registerHandler("deleteSelected", () => {
      if (!canvasStore.hasSelection) return;
      // Element-bearing refs go through bulk-delete.
      const hasElementRefs = canvasStore.selectedElements.some(
        (s) => s.elementId !== null,
      );
      if (hasElementRefs) {
        canvasStore.removeSelectedElements();
        return;
      }
      // Single image-layer fallback.
      const selected = canvasStore.selectedLayer;
      if (!selected || selected.locked) return;
      const id = selected.id;
      canvasStore.deselectLayer();
      canvasStore.removeLayer(id);
    });

    // Tool selection
    KeyBindingManager.registerHandler("selectSelectTool", () =>
      canvasStore.setActiveTool("select")
    );
    KeyBindingManager.registerHandler("selectShapeTool", () =>
      canvasStore.setActiveTool("shape")
    );
    KeyBindingManager.registerHandler("selectArrowTool", () => {
      canvasStore.setArrowKind("arrow");
      canvasStore.setActiveTool("arrow");
    });
    KeyBindingManager.registerHandler("selectLineTool", () => {
      canvasStore.setArrowKind("line");
      canvasStore.setActiveTool("arrow");
    });
    KeyBindingManager.registerHandler("selectTextTool", () =>
      canvasStore.setActiveTool("text")
    );
    KeyBindingManager.registerHandler("selectPen", () =>
      selectBrush(canvasStore, lastBrush()),
    );
    KeyBindingManager.registerHandler("selectEraser", () => {
      canvasStore.setActiveTool("brush");
      canvasStore.setBrushStyle("eraser");
    });
    KeyBindingManager.registerHandler("selectPencil", () =>
      selectBrush(canvasStore, "pencil"),
    );
    KeyBindingManager.registerHandler("selectMarker", () =>
      selectBrush(canvasStore, "marker"),
    );
    KeyBindingManager.registerHandler("selectHighlighter", () =>
      selectBrush(canvasStore, "highlighter"),
    );
    KeyBindingManager.registerHandler("selectAirbrush", () =>
      selectBrush(canvasStore, "airbrush"),
    );
    KeyBindingManager.registerHandler("selectCalligraphy", () =>
      selectBrush(canvasStore, "calligraphy"),
    );

    // Zoom controls
    KeyBindingManager.registerHandler("zoomIn", () => {
      const c = visibleCanvasCenter();
      canvasStore.zoomAt(canvasStore.zoom * 1.2, c.x, c.y);
    });
    KeyBindingManager.registerHandler("zoomOut", () => {
      const c = visibleCanvasCenter();
      canvasStore.zoomAt(canvasStore.zoom / 1.2, c.x, c.y);
    });
    KeyBindingManager.registerHandler("zoomReset", () => {
      fitView(canvasStore);
    });
    KeyBindingManager.registerHandler("fitToScreen", () => {
      fitView(canvasStore);
    });

    // File operations
    KeyBindingManager.registerHandler("save", () => onSave?.());
    KeyBindingManager.registerHandler("export", () => onExport?.());
    KeyBindingManager.registerHandler("newDrawing", () => {
      window.location.href = "/?new=1";
    });

    // UI controls
    KeyBindingManager.registerHandler("toggleSidebar", () =>
      onToggleSidebar?.()
    );
    KeyBindingManager.registerHandler("toggleVault", () => onToggleVault?.());

    // Color shortcuts
    KeyBindingManager.registerHandler("selectBlack", () =>
      canvasStore.setColor("#000000")
    );
    KeyBindingManager.registerHandler("selectWhite", () =>
      canvasStore.setColor("#ffffff")
    );
    KeyBindingManager.registerHandler("selectRed", () =>
      canvasStore.setColor("#ef4444")
    );

    // Brush size controls
    KeyBindingManager.registerHandler("increaseBrushSize", () => {
      canvasStore.setPenSize(Math.min(50, canvasStore.currentSize + 2));
    });
    KeyBindingManager.registerHandler("decreaseBrushSize", () => {
      canvasStore.setPenSize(Math.max(1, canvasStore.currentSize - 2));
    });

    const SHAPE_KIND_KEYS: Record<string, "rectangle" | "circle" | "diamond" | "triangle"> = {
      "1": "rectangle",
      "2": "circle",
      "3": "diamond",
      "4": "triangle",
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // While the shape tool is active, 1–4 pick the shape kind instead of brushes/select.
      if (
        canvasStore.activeTool === "shape" &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        const kind = SHAPE_KIND_KEYS[e.key];
        if (kind) {
          e.preventDefault();
          canvasStore.setCurrentShapeType(kind);
          return;
        }
      }

      // Handle the key event through the KeyBindingManager
      KeyBindingManager.handleKeyEvent(e);
    };

    document.addEventListener("keydown", handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Unregister all handlers
      Object.values(KEY_BINDINGS).forEach((binding) => {
        KeyBindingManager.unregisterHandler(binding.action);
      });
    };
  }, [canvasStore, onSave, onExport, onToggleSidebar, onToggleVault]);
};
