import type { StrokeLike } from "@/engine/types";
import { renderStroke } from "@/engine/render/renderStroke";
import { landingRegistry, whenBrushesReady } from "./engine";
import { mulberry } from "./doodles/library";
import { onFrame, prefersReducedMotion, watchVisible } from "./ticker";

interface Pt {
  x: number;
  y: number;
}

interface Bot {
  el: HTMLElement;
  pos: Pt;
  from: Pt;
  ctrl: Pt;
  to: Pt;
  t0: number;
  dur: number;
  rest: number;
  pine: boolean;
  onArrive: (() => void) | null;
}

interface Tree {
  el: HTMLCanvasElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  born: number;
  falling: boolean;
}

const NAMES = [
  { name: "pine (unsupervised)", color: "#2f6b3a", pine: true },
  { name: "watercolor (late again)", color: "#2d63a8", pine: false },
  { name: "pencil (on a break)", color: "#5e5953", pine: false },
];

const ARROW = `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 2 L19 10.5 L11.5 12.5 L8 20 Z" fill="currentColor" stroke="#141416" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

export interface Squish {
  kick(amount: number): void;
}

export function springButton(el: HTMLElement): Squish {
  let s = 0;
  let v = 0;
  let stop: (() => void) | null = null;
  let last = 0;
  const step = (now: number) => {
    const dt = Math.min(0.032, last ? (now - last) / 1000 : 0.016);
    last = now;
    v += (-260 * s - 12 * v) * dt;
    s += v * dt;
    el.style.setProperty("--sx", String(1 + s));
    el.style.setProperty("--sy", String(1 - s * 0.85));
    if (Math.abs(s) < 0.0008 && Math.abs(v) < 0.01) {
      el.style.removeProperty("--sx");
      el.style.removeProperty("--sy");
      stop?.();
      stop = null;
      last = 0;
    }
  };
  return {
    kick(amount: number) {
      if (prefersReducedMotion()) return;
      v += amount;
      if (!stop) stop = onFrame(step);
    },
  };
}

export function mountCursors(hero: HTMLElement, cta: HTMLElement | null): () => void {
  const overlay = hero.querySelector<HTMLElement>("[data-cursors]")!;
  const squish = cta ? springButton(cta) : null;
  const onEnter = () => squish?.kick(-1.4);
  cta?.addEventListener("pointerenter", onEnter);
  if (prefersReducedMotion()) {
    return () => cta?.removeEventListener("pointerenter", onEnter);
  }
  const rand = mulberry((Date.now() * 13) >>> 0);
  const phone = matchMedia("(max-width: 767px)").matches;
  const bots: Bot[] = NAMES.slice(0, phone ? 1 : 3).map((n) => {
    const el = document.createElement("div");
    el.className = "lp-cursor";
    el.style.setProperty("--c", n.color);
    el.innerHTML = `${ARROW}<span>${n.name}</span>`;
    overlay.append(el);
    const p = { x: rand() * overlay.clientWidth, y: rand() * overlay.clientHeight };
    return { el, pos: p, from: p, ctrl: p, to: p, t0: 0, dur: 0, rest: 0, pine: n.pine, onArrive: null };
  });
  const trees: Tree[] = [];
  let nextPine = performance.now() + 5000 + rand() * 5000;
  let stopFrame: (() => void) | null = null;

  const box = () => ({ w: overlay.clientWidth, h: overlay.clientHeight });

  const travel = (b: Bot, to: Pt, now: number, onArrive: (() => void) | null = null) => {
    const dx = to.x - b.pos.x;
    const dy = to.y - b.pos.y;
    const dist = Math.hypot(dx, dy);
    b.from = { ...b.pos };
    b.to = to;
    b.ctrl = { x: b.pos.x + dx / 2 + (rand() - 0.5) * dist * 0.6, y: b.pos.y + dy / 2 + (rand() - 0.5) * dist * 0.6 };
    b.t0 = now;
    b.dur = 900 + dist * 3.2 + rand() * 600;
    b.rest = 400 + rand() * 1400;
    b.onArrive = onArrive;
  };

  const wander = (b: Bot, now: number) => {
    const { w, h } = box();
    travel(b, { x: 30 + rand() * (w - 160), y: 30 + rand() * (h - 80) }, now);
  };

  const ctaSpot = (): Pt | null => {
    if (!cta || cta.offsetParent === null) return null;
    const o = overlay.getBoundingClientRect();
    const r = cta.getBoundingClientRect();
    return { x: r.left - o.left + 18 + rand() * (r.width - 36), y: r.top - o.top + 2 };
  };

  const plant = async (at: Pt) => {
    const c = document.createElement("canvas");
    const size = 56;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = c.height = size * dpr;
    c.className = "lp-tree";
    c.style.width = c.style.height = `${size}px`;
    const stroke: StrokeLike = {
      id: `tree-${Math.round(at.x)}-${Math.round(at.y)}`,
      points: [
        { x: size / 2 - 0.5, y: size * 0.62, pressure: 0.6 },
        { x: size / 2 + 0.5, y: size * 0.62, pressure: 0.6 },
      ],
      color: "#3f8a4f",
      size: 52,
      opacity: 1,
      brushStyle: "pine",
      timestamp: 0,
    };
    await whenBrushesReady({ id: "tree", w: size, h: size, strokes: [stroke], duration: 0 });
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderStroke(ctx, stroke, landingRegistry());
    overlay.append(c);
    trees.push({ el: c, x: at.x - size / 2, y: at.y - size * 0.95, vx: 0, vy: 0, rot: 0, vr: 0, born: performance.now(), falling: false });
    squish?.kick(1.6);
  };

  const pineRun = (b: Bot, now: number, left: number) => {
    const spot = ctaSpot();
    if (!spot || left <= 0) {
      wander(b, now);
      return;
    }
    travel(b, spot, now, () => {
      void plant(spot);
      b.rest = 1e9;
      b.onArrive = null;
      setTimeout(() => pineRun(b, performance.now(), left - 1), 280);
    });
    b.dur = Math.min(b.dur, 1100);
  };

  let last = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    for (const b of bots) {
      if (!b.dur) {
        wander(b, now);
        continue;
      }
      const t = Math.min(1, (now - b.t0) / b.dur);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const u = 1 - e;
      b.pos = {
        x: u * u * b.from.x + 2 * u * e * b.ctrl.x + e * e * b.to.x,
        y: u * u * b.from.y + 2 * u * e * b.ctrl.y + e * e * b.to.y,
      };
      b.el.style.transform = `translate(${b.pos.x}px, ${b.pos.y}px)`;
      if (t >= 1) {
        if (b.onArrive) {
          const fn = b.onArrive;
          b.onArrive = null;
          fn();
        } else if (now - b.t0 > b.dur + b.rest) {
          if (b.pine && now > nextPine) {
            nextPine = now + 12000 + rand() * 8000;
            pineRun(b, now, 2 + Math.floor(rand() * 2));
          } else wander(b, now);
        }
      }
    }
    for (let i = trees.length - 1; i >= 0; i--) {
      const tr = trees[i];
      const age = now - tr.born;
      if (!tr.falling && age > 1400 + i * 120) {
        tr.falling = true;
        tr.vx = (rand() - 0.5) * 120;
        tr.vy = -120 - rand() * 80;
        tr.vr = (rand() - 0.5) * 9;
      }
      if (tr.falling) {
        tr.vy += 900 * dt;
        tr.x += tr.vx * dt;
        tr.y += tr.vy * dt;
        tr.rot += tr.vr * dt;
      }
      const fade = tr.falling ? Math.max(0, 1 - (age - 1400) / 900) : 1;
      tr.el.style.opacity = String(fade);
      tr.el.style.transform = `translate(${tr.x}px, ${tr.y}px) rotate(${tr.rot}rad)`;
      if (fade <= 0) {
        tr.el.remove();
        trees.splice(i, 1);
      }
    }
  };

  const resume = () => {
    if (stopFrame) return;
    last = 0;
    stopFrame = onFrame(frame);
  };
  const pause = () => {
    stopFrame?.();
    stopFrame = null;
  };
  const stopVisible = watchVisible(hero, (v) => (v ? resume() : pause()));

  return () => {
    pause();
    stopVisible();
    cta?.removeEventListener("pointerenter", onEnter);
    for (const b of bots) b.el.remove();
    for (const t of trees) t.el.remove();
  };
}
