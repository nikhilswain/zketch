"use client";

import { useEffect } from "react";
import { useCanvasStore } from "../hooks/useStores";
import { KeyBindingManager, KEY_BINDINGS } from "../utils/keyBindings";

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

    // Tool selection
    KeyBindingManager.registerHandler("selectPen", () =>
      canvasStore.setBrushStyle("ink")
    );
    KeyBindingManager.registerHandler("selectEraser", () =>
      canvasStore.setBrushStyle("eraser")
    );
    KeyBindingManager.registerHandler("selectSpray", () =>
      canvasStore.setBrushStyle("spray")
    );
    KeyBindingManager.registerHandler("selectTexture", () =>
      canvasStore.setBrushStyle("texture")
    );

    // Zoom controls
    KeyBindingManager.registerHandler("zoomIn", () => {
      canvasStore.setZoom(Math.min(5, canvasStore.zoom * 1.2));
    });
    KeyBindingManager.registerHandler("zoomOut", () => {
      canvasStore.setZoom(Math.max(0.1, canvasStore.zoom / 1.2));
    });
    KeyBindingManager.registerHandler("zoomReset", () => {
      canvasStore.setZoom(1);
      canvasStore.setPan(0, 0);
    });
    KeyBindingManager.registerHandler("fitToScreen", () => {
      canvasStore.setZoom(1);
      canvasStore.setPan(0, 0);
    });

    // File operations
    KeyBindingManager.registerHandler("save", () => onSave?.());
    KeyBindingManager.registerHandler("export", () => onExport?.());
    KeyBindingManager.registerHandler("newDrawing", () => {
      if (confirm("Start a new drawing? Unsaved changes will be lost.")) {
        canvasStore.clear();
      }
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

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
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
