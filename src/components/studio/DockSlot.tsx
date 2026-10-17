import type React from "react";
import { useEffect, useState } from "react";

export const DOCK_MS = 200;

export function usePresence(open: boolean, ms = DOCK_MS) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);

  return { mounted, shown };
}

interface DockSlotProps {
  open: boolean;
  axis: "x" | "y";
  size: number;
  from: "left" | "right" | "bottom";
  className?: string;
  children: React.ReactNode;
}

const DockSlot: React.FC<DockSlotProps> = ({ open, axis, size, from, className, children }) => {
  const { mounted, shown } = usePresence(open);
  if (!mounted) return null;
  const extent = shown ? size : 0;
  return (
    <div
      className={`flex shrink-0 overflow-hidden ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none ${
        axis === "x" ? "transition-[width]" : "flex-col transition-[height]"
      } ${from === "left" || from === "bottom" ? "justify-end" : "justify-start"} ${className ?? ""}`}
      style={{ [axis === "x" ? "width" : "height"]: extent, transitionDuration: `${DOCK_MS}ms` }}
    >
      {children}
    </div>
  );
};

export default DockSlot;
