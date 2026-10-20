import type { BrushStyle } from "@/engine/types";
import { DoodlePlayer } from "./DoodlePlayer";
import { autograph } from "./doodles/library";
import { onBrushAssetsChanged, prewarm, whenBrushesReady } from "./engine";
import { onFrame, prefersReducedMotion, watchVisible } from "./ticker";

const SIGN_MS = 1300;

interface Card {
  el: HTMLButtonElement;
  canvas: HTMLCanvasElement;
  player: DoodlePlayer | null;
  stop: (() => void) | null;
  token: number;
  seed: number;
}

export function mountCards(root: HTMLElement): () => void {
  const reduced = prefersReducedMotion();
  const cards: Card[] = [...root.querySelectorAll<HTMLButtonElement>("[data-card]")].map((el, i) => ({
    el,
    canvas: el.querySelector<HTMLCanvasElement>("canvas[data-autograph]")!,
    player: null,
    stop: null,
    token: 0,
    seed: 11 + i * 97,
  }));

  const sigOf = (c: Card) => {
    const name = c.el.querySelector(".lp-card-name")?.textContent?.trim() ?? "zketch";
    return autograph(name.toLowerCase(), c.el.dataset.brush as BrushStyle, c.el.dataset.color ?? "#23201c", c.seed);
  };
  if (!reduced) prewarm(cards.map(sigOf));

  const sign = async (c: Card) => {
    const token = ++c.token;
    c.stop?.();
    c.stop = null;
    const name = c.el.querySelector(".lp-card-name")?.textContent?.trim() ?? "zketch";
    const doodle = autograph(name.toLowerCase(), c.el.dataset.brush as BrushStyle, c.el.dataset.color ?? "#23201c", c.seed++);
    await whenBrushesReady(doodle);
    if (token !== c.token) return;
    const w = c.canvas.clientWidth || 200;
    const h = c.canvas.clientHeight || 80;
    c.player = new DoodlePlayer(c.canvas, doodle, w, h);
    if (reduced) {
      c.player.finish();
      return;
    }
    const player = c.player;
    const t0 = performance.now();
    const rate = doodle.duration / SIGN_MS;
    const stop = onFrame((now) => {
      if (player.renderAt((now - t0) * rate)) {
        stop();
        if (c.stop === stop) c.stop = null;
      }
    });
    c.stop = stop;
  };

  const stops: (() => void)[] = [];
  for (const [i, c] of cards.entries()) {
    const again = () => void sign(c);
    c.el.addEventListener("pointerenter", again);
    c.el.addEventListener("focus", again);
    c.el.addEventListener("click", again);
    let seen = false;
    stops.push(
      watchVisible(
        c.el,
        (v) => {
          if (!v || seen) return;
          seen = true;
          setTimeout(() => {
            if (!c.player) void sign(c);
          }, reduced ? 0 : 250 + i * 450);
        },
        "0px",
      ),
    );
    stops.push(() => {
      c.el.removeEventListener("pointerenter", again);
      c.el.removeEventListener("focus", again);
      c.el.removeEventListener("click", again);
    });
  }

  stops.push(
    onBrushAssetsChanged(() => {
      for (const c of cards) c.player?.rebake();
    }),
  );

  return () => {
    for (const s of stops) s();
    for (const c of cards) c.stop?.();
  };
}
