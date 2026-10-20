import type React from "react";
import { useEffect, useRef, useState } from "react";

const THRESHOLD = 4;

type Drag = {
  id: string;
  pointerId: number;
  startY: number;
  active: boolean;
  dy: number;
  from: number;
  to: number;
  tops: number[];
  heights: number[];
  span: number;
};

export function useSortableList(ids: string[], onMove: (id: string, to: number) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [settling, setSettling] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!settling) return;
    const f = requestAnimationFrame(() => setSettling(false));
    return () => cancelAnimationFrame(f);
  }, [settling]);

  useEffect(() => {
    if (!drag) return;
    const update = (d: Drag | null) => {
      dragRef.current = d;
      setDrag(d);
    };
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const raw = e.clientY - d.startY;
      if (!d.active && Math.abs(raw) < THRESHOLD) return;
      const last = d.tops.length - 1;
      const dy = Math.max(d.tops[0] - d.tops[d.from], Math.min(d.tops[last] - d.tops[d.from], raw));
      e.preventDefault();
      const centre = d.tops[d.from] + d.heights[d.from] / 2 + dy;
      let to = 0;
      d.tops.forEach((top, i) => {
        if (i !== d.from && top + d.heights[i] / 2 < centre) to++;
      });
      update({ ...d, active: true, dy, to });
    };
    const finish = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      update(null);
      if (!d.active) return;
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      setSettling(true);
      if (e.type === "pointerup" && d.to !== d.from) onMoveRef.current(d.id, d.to);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !dragRef.current?.active) return;
      e.stopPropagation();
      setSettling(true);
      update(null);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [drag !== null]);

  const start = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const onHandle = !!target.closest("[data-sort-handle]");
    if (!onHandle && (e.pointerType === "touch" || target.closest("button, input, [role=menuitem], [role=slider]"))) return;
    const list = idsRef.current;
    const from = list.indexOf(id);
    if (from === -1) return;
    const rects = list.map((x) => nodes.current.get(x)?.getBoundingClientRect());
    if (rects.some((r) => !r)) return;
    const tops = rects.map((r) => r!.top);
    const heights = rects.map((r) => r!.height);
    const span = list.length > 1 ? Math.abs(tops[1] - tops[0]) : heights[from];
    const d: Drag = { id, pointerId: e.pointerId, startY: e.clientY, active: false, dy: 0, from, to: from, tops, heights, span };
    dragRef.current = d;
    setDrag(d);
  };

  const itemProps = (id: string) => {
    const i = ids.indexOf(id);
    let transform = "";
    let lifted = false;
    if (drag?.active) {
      if (id === drag.id) {
        lifted = true;
        transform = `translateY(${drag.dy}px) scale(1.03)`;
      } else if (drag.from < drag.to && i > drag.from && i <= drag.to) transform = `translateY(${-drag.span}px)`;
      else if (drag.from > drag.to && i >= drag.to && i < drag.from) transform = `translateY(${drag.span}px)`;
    }
    return {
      ref: (el: HTMLElement | null) => {
        if (el) nodes.current.set(id, el);
        else nodes.current.delete(id);
      },
      onPointerDown: (e: React.PointerEvent) => start(id, e),
      "data-lifted": lifted || undefined,
      style: {
        transform: transform || undefined,
        transition: lifted || settling || !drag?.active ? "none" : "transform 160ms cubic-bezier(0.2, 0.7, 0.2, 1)",
        zIndex: lifted ? 20 : undefined,
        position: "relative" as const,
      },
    };
  };

  return { itemProps, dragging: drag?.active ? drag.id : null };
}
