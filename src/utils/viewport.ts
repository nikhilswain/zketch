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
