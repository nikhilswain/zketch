import { fitPage } from "./page";

export function visibleCanvasRect() {
  const root = document.querySelector("[data-canvas-root]")?.getBoundingClientRect();
  const view = document.querySelector("[data-canvas-viewport]")?.getBoundingClientRect() ?? root;
  if (!root || !view) return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  return { x: view.left - root.left, y: view.top - root.top, width: view.width, height: view.height };
}

export function visibleCanvasCenter() {
  const r = visibleCanvasRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

type PageView = {
  page: { x: number; y: number; width: number; height: number } | null;
  setZoom(z: number): void;
  setPan(x: number, y: number): void;
};

export function fitViewToPage(store: PageView) {
  if (!store.page) return false;
  const r = visibleCanvasRect();
  const v = fitPage(store.page, r.width, r.height);
  store.setZoom(v.zoom);
  store.setPan(v.panX + r.x, v.panY + r.y);
  return true;
}

export function fitView(store: PageView) {
  if (fitViewToPage(store)) return;
  const r = visibleCanvasRect();
  store.setZoom(1);
  store.setPan(r.x, r.y);
}
