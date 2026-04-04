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
