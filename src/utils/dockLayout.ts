import { observable, runInAction } from "mobx";

export type PanelId = "brushes" | "presets" | "stroke" | "colour" | "layers" | "shapes";
export type DockId = "left" | "right" | "bottom";
export type LayoutId = "bottom" | "sidebars" | "simple" | "custom";

export const PANEL_IDS: PanelId[] = [
  "brushes",
  "presets",
  "stroke",
  "colour",
  "layers",
  "shapes",
];

const DOCK_IDS: DockId[] = ["left", "right", "bottom"];
const STORAGE_KEY = "zketch-dock-layout-v1";
const SAVE_DELAY_MS = 300;

interface PanelPlacement {
  dock: DockId;
  order: number;
  collapsed: boolean;
}

export interface DockState {
  panels: Record<PanelId, PanelPlacement>;
  deckOpen: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  layout: LayoutId;
}

function place(entries: [PanelId, DockId][]): Record<PanelId, PanelPlacement> {
  const counters: Record<DockId, number> = { left: 0, right: 0, bottom: 0 };
  const out = {} as Record<PanelId, PanelPlacement>;
  for (const [id, dock] of entries) {
    out[id] = { dock, order: counters[dock]++, collapsed: false };
  }
  return out;
}

function preset(id: Exclude<LayoutId, "custom">): DockState {
  if (id === "sidebars") {
    return {
      panels: place([
        ["layers", "left"],
        ["colour", "left"],
        ["presets", "right"],
        ["brushes", "right"],
        ["stroke", "right"],
        ["shapes", "right"],
      ]),
      deckOpen: false,
      leftOpen: true,
      rightOpen: true,
      layout: "sidebars",
    };
  }
  const panels = place([
    ["brushes", "bottom"],
    ["presets", "bottom"],
    ["stroke", "bottom"],
    ["colour", "bottom"],
    ["layers", "right"],
    ["shapes", "right"],
  ]);
  return {
    panels,
    deckOpen: false,
    leftOpen: false,
    rightOpen: id === "bottom",
    layout: id,
  };
}

function restore(): DockState {
  const base = preset("bottom");
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return base;
    const state: DockState = {
      panels: { ...base.panels },
      deckOpen: parsed.deckOpen === true,
      leftOpen: parsed.leftOpen === true,
      rightOpen: parsed.rightOpen !== false,
      layout: ["bottom", "sidebars", "simple", "custom"].includes(parsed.layout)
        ? parsed.layout
        : "bottom",
    };
    for (const id of PANEL_IDS) {
      const p = parsed.panels?.[id];
      if (
        p &&
        DOCK_IDS.includes(p.dock) &&
        typeof p.order === "number" &&
        Number.isFinite(p.order)
      ) {
        state.panels[id] = { dock: p.dock, order: p.order, collapsed: p.collapsed === true };
      }
    }
    return state;
  } catch {
    return base;
  }
}

export const dockLayout = observable(
  {
    state: preset("bottom") as DockState,
    overlay: false,
    overlayHidden: { left: false, right: false, bottom: false } as Record<DockId, boolean>,
    dragging: null as PanelId | null,
  },
  { state: observable.deep },
);

function unhide(dock: DockId) {
  dockLayout.overlayHidden[dock] = false;
}

export function setOverlayMode(on: boolean) {
  runInAction(() => {
    dockLayout.overlay = on;
    dockLayout.overlayHidden = { left: false, right: false, bottom: false };
  });
}

export function hideOverlayDocks() {
  runInAction(() => {
    dockLayout.overlayHidden = { left: true, right: true, bottom: true };
  });
}

export function setDraggingPanel(id: PanelId | null) {
  runInAction(() => {
    dockLayout.dragging = id;
  });
}

export function isDockShown(dock: DockId) {
  return isDockOpen(dock) && panelsIn(dock).length > 0 && !(dockLayout.overlay && dockLayout.overlayHidden[dock]);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dockLayout.state));
    } catch {
      return;
    }
  }, SAVE_DELAY_MS);
}

function renumber(dock: DockId) {
  panelsIn(dock).forEach((id, i) => {
    dockLayout.state.panels[id].order = i;
  });
}

function customised() {
  dockLayout.state.layout = "custom";
}

export function loadDockLayout() {
  const state = restore();
  runInAction(() => {
    dockLayout.state = state;
  });
}

export function panelsIn(dock: DockId): PanelId[] {
  return PANEL_IDS.filter((id) => dockLayout.state.panels[id].dock === dock).sort(
    (a, b) => dockLayout.state.panels[a].order - dockLayout.state.panels[b].order,
  );
}

export function movePanel(id: PanelId, dock: DockId, index?: number) {
  runInAction(() => {
    const from = dockLayout.state.panels[id].dock;
    const target = panelsIn(dock).filter((p) => p !== id);
    const at = index === undefined ? target.length : Math.max(0, Math.min(index, target.length));
    target.splice(at, 0, id);
    dockLayout.state.panels[id].dock = dock;
    target.forEach((p, i) => {
      dockLayout.state.panels[p].order = i;
    });
    if (from !== dock) renumber(from);
    if (dock === "left") dockLayout.state.leftOpen = true;
    if (dock === "right") dockLayout.state.rightOpen = true;
    if (dock === "bottom") dockLayout.state.deckOpen = true;
    unhide(dock);
    customised();
  });
  save();
}

export function toggleCollapsed(id: PanelId) {
  runInAction(() => {
    dockLayout.state.panels[id].collapsed = !dockLayout.state.panels[id].collapsed;
  });
  save();
}

export function setDeckOpen(open: boolean) {
  runInAction(() => {
    dockLayout.state.deckOpen = open;
    if (open) unhide("bottom");
  });
  save();
}

export function setSideOpen(side: "left" | "right", open: boolean) {
  runInAction(() => {
    if (side === "left") dockLayout.state.leftOpen = open;
    else dockLayout.state.rightOpen = open;
    if (open) unhide(side);
  });
  save();
}

export function isDockOpen(dock: DockId) {
  const s = dockLayout.state;
  return dock === "bottom" ? s.deckOpen : dock === "left" ? s.leftOpen : s.rightOpen;
}

export function applyLayout(id: Exclude<LayoutId, "custom">) {
  runInAction(() => {
    dockLayout.state = preset(id);
    dockLayout.overlayHidden = { left: false, right: false, bottom: false };
  });
  save();
}

export function revealPanel(id: PanelId) {
  runInAction(() => {
    const p = dockLayout.state.panels[id];
    p.collapsed = false;
    if (p.dock === "bottom") dockLayout.state.deckOpen = true;
    else if (p.dock === "left") dockLayout.state.leftOpen = true;
    else dockLayout.state.rightOpen = true;
    unhide(p.dock);
  });
  save();
}
