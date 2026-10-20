import { DoodlePlayer } from "./DoodlePlayer";
import { doodleById, mulberry } from "./doodles/library";
import { onBrushAssetsChanged, whenBrushesReady } from "./engine";
import { getDoodleMode } from "./hero";
import { onFrame, prefersReducedMotion, watchVisible } from "./ticker";

interface Margin {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  id: string;
  player: DoodlePlayer | null;
  state: "idle" | "queued" | "drawing" | "done";
  visible: boolean;
  t0: number;
}

export function mountMargins(root: HTMLElement): () => void {
  const reduced = prefersReducedMotion();
  const rand = mulberry((Date.now() * 7) >>> 0);
  const margins: Margin[] = [...root.querySelectorAll<HTMLElement>("[data-margin]")].map((el) => ({
    el,
    canvas: el.querySelector("canvas")!,
    id: el.dataset.margin!,
    player: null,
    state: "idle",
    visible: false,
    t0: 0,
  }));
  const queue: Margin[] = [];
  let busy = false;
  let stopFrame: (() => void) | null = null;
  let lastTick = -1;

  const frame = (now: number) => {
    const tick = Math.floor(now / 125);
    const boil = tick !== lastTick;
    lastTick = tick;
    let baked = false;
    let any = false;
    for (const [i, m] of margins.entries()) {
      if (!m.player || !m.visible) continue;
      if (m.state === "drawing") {
        any = true;
        if (m.player.renderAt(now - m.t0)) {
          m.state = "done";
          busy = false;
          next();
        }
      } else if (m.state === "done") {
        any = true;
        if (!baked && !m.player.bakeNext()) baked = true;
        else if (boil) m.player.boil(tick + i);
      }
    }
    if (!any) stopLoop();
  };

  const startLoop = () => {
    if (!stopFrame && !reduced) stopFrame = onFrame(frame);
  };

  const stopLoop = () => {
    stopFrame?.();
    stopFrame = null;
  };

  const settle = (m: Margin) => {
    m.player?.finish();
    m.state = "done";
    busy = false;
    next();
  };

  const next = () => {
    if (busy) return;
    let m = queue.shift();
    while (m && !m.visible) {
      m.state = "idle";
      m = queue.shift();
    }
    if (!m) return;
    busy = true;
    const doodle = doodleById(m.id)!.make(Math.floor(rand() * 1e6), getDoodleMode());
    void whenBrushesReady(doodle).then(() => {
      m.player = new DoodlePlayer(m.canvas, doodle, m.canvas.clientWidth || 260);
      if (reduced || !m.visible) {
        settle(m);
        return;
      }
      m.state = "drawing";
      m.t0 = performance.now();
      startLoop();
    });
  };

  const stops = margins.map((m) =>
    watchVisible(
      m.el,
      (v) => {
        m.visible = v;
        if (v && m.state === "idle") {
          m.state = "queued";
          queue.push(m);
          next();
        }
        if (v && m.state !== "idle") startLoop();
        if (!v && m.state === "queued") {
          const i = queue.indexOf(m);
          if (i >= 0) {
            queue.splice(i, 1);
            m.state = "idle";
          }
        }
        if (!v && m.state === "drawing" && m.player) settle(m);
      },
      "0px",
    ),
  );

  const stopAssets = onBrushAssetsChanged(() => {
    for (const m of margins) m.player?.rebake();
  });

  return () => {
    stopLoop();
    stopAssets();
    for (const s of stops) s();
  };
}
