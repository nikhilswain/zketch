export interface KeyBinding {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  description: string;
  action: string;
}

export const KEY_BINDINGS: Record<string, KeyBinding> = {
  // Canvas Actions
  UNDO: {
    key: "z",
    ctrlKey: true,
    description: "Undo last action",
    action: "undo",
  },
  REDO: {
    key: "z",
    ctrlKey: true,
    shiftKey: true,
    description: "Redo last undone action",
    action: "redo",
  },
  CLEAR_CANVAS: {
    key: "Delete",
    description: "Clear entire canvas",
    action: "clearCanvas",
  },
  CLEAR_CANVAS_ALT: {
    key: "Backspace",
    ctrlKey: true,
    description: "Clear entire canvas (alternative)",
    action: "clearCanvas",
  },

  // Drawing Tools
  PEN_TOOL: {
    key: "1",
    description: "Select pen tool",
    action: "selectPen",
  },
  ERASER_TOOL: {
    key: "2",
    description: "Select eraser tool",
    action: "selectEraser",
  },
  SPRAY_TOOL: {
    key: "3",
    description: "Select spray tool",
    action: "selectSpray",
  },
  TEXTURE_TOOL: {
    key: "4",
    description: "Select texture tool",
    action: "selectTexture",
  },

  // Canvas Navigation
  PAN_MODE: {
    key: " ",
    description: "Hold to pan canvas",
    action: "panMode",
  },
  ZOOM_IN: {
    key: "=",
    ctrlKey: true,
    description: "Zoom in",
    action: "zoomIn",
  },
  // Some keyboards emit '+' when pressing Shift+='; capture that too
  ZOOM_IN_PLUS: {
    key: "+",
    ctrlKey: true,
    description: "Zoom in",
    action: "zoomIn",
  },
  ZOOM_OUT: {
    key: "-",
    ctrlKey: true,
    description: "Zoom out",
    action: "zoomOut",
  },
  ZOOM_RESET: {
    key: "0",
    ctrlKey: true,
    description: "Reset zoom to 100%",
    action: "zoomReset",
  },
  FIT_TO_SCREEN: {
    key: "f",
    ctrlKey: true,
    description: "Fit canvas to screen",
    action: "fitToScreen",
  },

  // File Operations
  SAVE: {
    key: "s",
    ctrlKey: true,
    description: "Save drawing to vault",
    action: "save",
  },
  EXPORT: {
    key: "e",
    ctrlKey: true,
    description: "Export drawing",
    action: "export",
  },
  NEW_DRAWING: {
    key: "n",
    ctrlKey: true,
    description: "New drawing",
    action: "newDrawing",
  },

  // UI Controls
  TOGGLE_SIDEBAR: {
    key: "t",
    ctrlKey: true,
    description: "Toggle sidebar",
    action: "toggleSidebar",
  },
  TOGGLE_VAULT: {
    key: "v",
    ctrlKey: true,
    description: "Toggle vault view",
    action: "toggleVault",
  },

  // Color Shortcuts
  BLACK_COLOR: {
    key: "b",
    description: "Select black color",
    action: "selectBlack",
  },
  WHITE_COLOR: {
    key: "w",
    description: "Select white color",
    action: "selectWhite",
  },
  RED_COLOR: {
    key: "r",
    description: "Select red color",
    action: "selectRed",
  },

  // Size Controls
  INCREASE_SIZE: {
    key: "]",
    description: "Increase brush size",
    action: "increaseBrushSize",
  },
  DECREASE_SIZE: {
    key: "[",
    description: "Decrease brush size",
    action: "decreaseBrushSize",
  },
};

export class KeyBindingManager {
  private static handlers: Map<string, () => void> = new Map();

  static registerHandler(action: string, handler: () => void) {
    this.handlers.set(action, handler);
  }

  static unregisterHandler(action: string) {
    this.handlers.delete(action);
  }

  static handleKeyEvent(event: KeyboardEvent): boolean {
    const binding = this.findMatchingBinding(event);
    if (binding) {
      const handler = this.handlers.get(binding.action);
      if (handler) {
        event.preventDefault();
        handler();
        return true;
      }
    }
    return false;
  }

  private static findMatchingBinding(event: KeyboardEvent): KeyBinding | null {
    for (const binding of Object.values(KEY_BINDINGS)) {
      if (this.matchesBinding(event, binding)) {
        return binding;
      }
    }
    return null;
  }

  private static matchesBinding(
    event: KeyboardEvent,
    binding: KeyBinding
  ): boolean {
    return (
      event.key.toLowerCase() === binding.key.toLowerCase() &&
      !!event.ctrlKey === !!binding.ctrlKey &&
      !!event.shiftKey === !!binding.shiftKey &&
      !!event.altKey === !!binding.altKey &&
      !!event.metaKey === !!binding.metaKey
    );
  }

  static getBindingDescription(action: string): string {
    const binding = Object.values(KEY_BINDINGS).find(
      (b) => b.action === action
    );
    if (!binding) return "";

    const modifiers = [];
    if (binding.ctrlKey) modifiers.push("Ctrl");
    if (binding.shiftKey) modifiers.push("Shift");
    if (binding.altKey) modifiers.push("Alt");
    if (binding.metaKey) modifiers.push("Cmd");

    const keyDisplay = binding.key === " " ? "Space" : binding.key;
    return modifiers.length > 0
      ? `${modifiers.join("+")}+${keyDisplay}`
      : keyDisplay;
  }

  static getAllBindings(): KeyBinding[] {
    return Object.values(KEY_BINDINGS);
  }
}
