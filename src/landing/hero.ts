import { DoodlePlayer } from "./DoodlePlayer";
import { mulberry, pickDoodles, type DoodleDef, type DoodleMode } from "./doodles/library";
import { onBrushAssetsChanged, warmGrain, whenBrushesReady } from "./engine";
import { activeDrawing, debugLanding, onFrame, prefersReducedMotion, releaseDrawSlot, requestDrawSlot, watchVisible } from "./ticker";

type Phase = "idle" | "loading" | "waiting" | "drawing" | "boiling" | "erasing";

interface Slot {
  el: HTMLButtonElement;
  canvas: HTMLCanvasElement;
  eraser: HTMLElement;
  player: DoodlePlayer | null;
  def: DoodleDef | null;
  phase: Phase;
  t0: number;
  until: number;
  token: number;
  cancel: (() => void) | null;
}

const ERASE_MS = 900;
const listeners = new Set<(mode: DoodleMode) => void>();
let mode: DoodleMode = "normal";

export function setDoodleMode(next: DoodleMode): void {
  mode = next;
  for (const fn of listeners) fn(next);
}

export function getDoodleMode(): DoodleMode {
  return mode;
}

export function onDoodleMode(fn: (mode: DoodleMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function mountHero(root: HTMLElement): () => void {
  const rand = mulberry((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const icon = root.querySelector<HTMLTemplateElement>("template[data-eraser-icon]")?.innerHTML ?? "";
  const slots: Slot[] = [...root.querySelectorAll<HTMLButtonElement>("[data-slot]")].map((el) => {
    const eraser = document.createElement("span");
    eraser.className = "lp-eraser";
    eraser.hidden = true;
    eraser.innerHTML = icon;
    el.append(eraser);
    return { el, canvas: el.querySelector("canvas")!, eraser, player: null, def: null, phase: "idle", t0: 0, until: 0, token: 0, cancel: null };
  });
  const reduced = prefersReducedMotion();
  const debug = debugLanding();
  let firstDone = false;
  let visible = false;
  let stopFrame: (() => void) | null = null;
  let pausedAt = 0;
  let lastBoil = -1;

  const shown = () => slots.filter((s) => s.el.offsetParent !== null);
  const recent: string[] = [];
  const onScreen = () => new Set([...recent, ...(slots.map((s) => s.def?.id).filter(Boolean) as string[])]);
  const log = (what: string) => {
    if (debug) console.log(`[landing] ${what} drawing=${activeDrawing()}`);
  };

  const reset = (s: Slot) => {
    s.token++;
    s.cancel?.();
    s.cancel = null;
    if (s.phase === "drawing" || s.phase === "erasing") releaseDrawSlot();
    s.phase = "idle";
    s.player?.clear();
    s.player = null;
    s.def = null;
    s.eraser.hidden = true;
  };

  const size = (s: Slot) => Math.max(40, s.canvas.clientWidth || s.el.clientWidth);

  const start = async (s: Slot, delay: number) => {
    const token = ++s.token;
    s.phase = "loading";
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (token !== s.token) return;
    const [def] = pickDoodles(1, rand, onScreen());
    s.def = def;
    recent.push(def.id);
    if (recent.length > 5) recent.shift();
    const doodle = def.make(Math.floor(rand() * 1e6), mode);
    await whenBrushesReady(doodle);
    if (token !== s.token) return;
    s.player = new DoodlePlayer(s.canvas, doodle, size(s));
    if (reduced) {
      s.player.finish();
      s.phase = "boiling";
      s.until = Infinity;
      return;
    }
    s.phase = "waiting";
    s.cancel = requestDrawSlot(() => {
      s.cancel = null;
      if (token !== s.token) {
        releaseDrawSlot();
        return;
      }
      s.phase = "drawing";
      s.t0 = performance.now();
      log(`draw ${def.id}`);
    });
  };

  const erase = (s: Slot, urgent: boolean) => {
    if (s.phase !== "boiling" && s.phase !== "drawing") return;
    if (s.phase === "drawing") {
      s.player?.finish();
      s.phase = "erasing";
      s.t0 = performance.now();
      return;
    }
    const token = s.token;
    s.phase = "waiting";
    s.cancel = requestDrawSlot(() => {
      s.cancel = null;
      if (token !== s.token) {
        releaseDrawSlot();
        return;
      }
      s.phase = "erasing";
      s.t0 = performance.now();
      log(`erase ${s.def?.id}`);
    }, urgent);
  };

  const frame = (now: number) => {
    const tick = Math.floor(now / 125);
    const boilTick = tick !== lastBoil;
    lastBoil = tick;
    let baked = false;
    for (const [i, s] of slots.entries()) {
      if (!s.player) continue;
      if (s.phase === "drawing") {
        if (s.player.renderAt(now - s.t0)) {
          releaseDrawSlot();
          s.phase = "boiling";
          s.until = now + 8000 + rand() * 7000;
          log(`done ${s.def?.id}`);
          if (!firstDone) {
            firstDone = true;
            warmGrain();
          }
        }
      } else if (s.phase === "boiling") {
        if (!baked && !s.player.bakeNext()) baked = true;
        else if (boilTick) s.player.boil(tick + i);
        if (now > s.until) erase(s, false);
      } else if (s.phase === "erasing") {
        const p = (now - s.t0) / ERASE_MS;
        const head = s.player.erase(p);
        s.eraser.hidden = false;
        s.eraser.style.transform = `translate(${head.x}px, ${head.y}px) rotate(-20deg)`;
        if (p >= 1) {
          releaseDrawSlot();
          log(`erased ${s.def?.id}`);
          s.player.clear();
          s.player = null;
          s.def = null;
          s.eraser.hidden = true;
          void start(s, 250);
        }
      }
    }
  };

  const resume = () => {
    if (stopFrame || reduced || !visible) return;
    if (pausedAt) {
      const gap = performance.now() - pausedAt;
      for (const s of slots) {
        s.t0 += gap;
        s.until += gap;
      }
      pausedAt = 0;
    }
    stopFrame = onFrame(frame);
  };

  const pause = () => {
    if (!stopFrame) return;
    stopFrame();
    stopFrame = null;
    pausedAt = performance.now();
  };

  const sync = () => {
    const on = new Set(shown());
    let k = 0;
    for (const s of slots) {
      if (!on.has(s)) {
        if (s.phase !== "idle") reset(s);
      } else if (s.phase === "idle") {
        void start(s, reduced ? 0 : 350 * k++);
      }
    }
  };

  const onHidden = () => (document.hidden ? pause() : resume());
  document.addEventListener("visibilitychange", onHidden);

  const stopVisible = watchVisible(root, (v) => {
    visible = v;
    if (v) resume();
    else pause();
  });

  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-slot]");
    const s = slots.find((x) => x.el === el);
    if (!s) return;
    if (reduced) {
      reset(s);
      void start(s, 0);
      return;
    }
    erase(s, true);
  };
  root.addEventListener("click", onClick);

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      for (const s of slots) {
        if (s.player && Math.abs(s.player.cssWidth - size(s)) > 4) {
          reset(s);
        }
      }
      sync();
    }, 200);
  };
  addEventListener("resize", onResize);

  const stopAssets = onBrushAssetsChanged(() => {
    for (const s of slots) if (s.player?.finished && (s.phase === "boiling" || reduced)) s.player.rebake();
  });

  const stopMode = onDoodleMode(() => {
    for (const s of slots) if (s.phase === "boiling") s.until = performance.now() + rand() * 1500;
  });

  sync();

  return () => {
    pause();
    stopVisible();
    stopAssets();
    stopMode();
    document.removeEventListener("visibilitychange", onHidden);
    root.removeEventListener("click", onClick);
    removeEventListener("resize", onResize);
    for (const s of slots) reset(s);
  };
}
