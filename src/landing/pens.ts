import type { BrushStyle, StrokeLike } from "@/engine/types";
import { renderStroke } from "@/engine/render/renderStroke";
import { landingRegistry, whenBrushesReady } from "./engine";
import { fill, mulberry, shapes, type Pt } from "./doodles/pen";
import { onFrame, prefersReducedMotion, watchVisible } from "./ticker";

interface Act {
  brush: BrushStyle;
  size: number;
  colors: string[];
  shape: (rand: () => number) => Pt[];
}

interface Mark {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stroke: StrokeLike;
  drawn: number;
  x: number;
  y: number;
  born: number;
  cta: boolean;
  fading: boolean;
  fadeAt: number;
  falling: boolean;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
}

interface Pen {
  el: HTMLElement;
  pos: Pt;
  from: Pt;
  ctrl: Pt;
  to: Pt;
  t0: number;
  dur: number;
  phase: "rest" | "travel" | "draw";
  until: number;
  mark: Mark | null;
  pine: boolean;
}

const ACTS: Act[] = [
  { brush: "pine", size: 58, colors: ["#2f6b3a", "#3d7a46"], shape: (r) => shapes.line({ x: 0, y: 0 }, { x: 60 + r() * 40, y: (r() - 0.5) * 10 }, 3) },
  { brush: "grass", size: 52, colors: ["#5f9a3a", "#7aa83f"], shape: (r) => shapes.line({ x: 0, y: 0 }, { x: 70 + r() * 30, y: (r() - 0.5) * 8 }, -4) },
  { brush: "stars", size: 36, colors: ["#d18a00", "#2d63a8"], shape: (r) => shapes.arc(0, 0, 34 + r() * 14, Math.PI * 1.1, Math.PI * 1.9) },
  { brush: "sparkle", size: 40, colors: ["#e8503f", "#c98a00"], shape: (r) => shapes.line({ x: 0, y: 0 }, { x: 50 + r() * 30, y: -20 - r() * 20 }, 8) },
  { brush: "leaves", size: 44, colors: ["#4f9d4a", "#8a9a3a"], shape: (r) => shapes.arc(0, 0, 30 + r() * 12, Math.PI * 0.9, Math.PI * 2.1) },
  {
    brush: "watercolor",
    size: 32,
    colors: ["#3d7cc9", "#ef7aa0", "#e8b417", "#2aa198"],
    shape: (r) => fill.scrub(shapes.ellipse(0, 0, 36 + r() * 14, 24 + r() * 10, 0), 8, -0.5),
  },
  {
    brush: "crayon",
    size: 9,
    colors: ["#e5483b", "#3d7cc9", "#8a63c9", "#f08a2c"],
    shape: (r) => {
      const out: Pt[] = [];
      const loops = 3 + Math.floor(r() * 2);
      for (let i = 0; i <= loops * 20; i++) {
        const t = i / 20;
        out.push({ x: t * 22 - 9 * Math.sin(2 * Math.PI * t), y: -14 * Math.abs(Math.sin(Math.PI * t)) });
      }
      return out;
    },
  },
];

const PINE = ACTS[0];

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

function bounds(pts: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function overlaps(a: DOMRect, x: number, y: number, w: number, h: number) {
  return x < a.right && x + w > a.left && y < a.bottom && y + h > a.top;
}

export function mountPens(hero: HTMLElement, cta: HTMLElement | null): () => void {
  const overlay = hero.querySelector<HTMLElement>("[data-pens]")!;
  const squish = cta ? springButton(cta) : null;
  const onEnter = () => squish?.kick(-1.4);
  cta?.addEventListener("pointerenter", onEnter);
  if (prefersReducedMotion()) return () => cta?.removeEventListener("pointerenter", onEnter);

  const rand = mulberry((Date.now() * 13) >>> 0);
  const icon = hero.querySelector<HTMLTemplateElement>("template[data-pen-icon]")?.innerHTML ?? "";
  const phone = matchMedia("(max-width: 767px)").matches;
  const marks: Mark[] = [];
  let count = 0;
  let nextPine = performance.now() + 6000 + rand() * 4000;
  let stopFrame: (() => void) | null = null;
  let last = 0;

  const pens: Pen[] = Array.from({ length: phone ? 1 : 2 }, (_, i) => {
    const el = document.createElement("div");
    el.className = "lp-pen";
    el.innerHTML = `${icon}<span class="lp-pen-dot"></span>`;
    overlay.append(el);
    const p = { x: overlay.clientWidth * (i ? 0.85 : 0.15), y: overlay.clientHeight * 0.5 };
    return { el, pos: p, from: p, ctrl: p, to: p, t0: 0, dur: 0, phase: "rest", until: 0, mark: null, pine: i === 0 };
  });

  const blocked = (x: number, y: number, w: number, h: number) => {
    const o = overlay.getBoundingClientRect();
    const rects = [hero.querySelector(".lp-hero-copy"), ...hero.querySelectorAll("[data-slot]")]
      .filter((el): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return new DOMRect(r.left - o.left - 12, r.top - o.top - 12, r.width + 24, r.height + 24);
      });
    return rects.some((r) => overlaps(r, x, y, w, h));
  };

  const spot = (w: number, h: number): Pt | null => {
    const W = overlay.clientWidth;
    const H = overlay.clientHeight;
    for (let i = 0; i < 24; i++) {
      const x = 16 + rand() * Math.max(1, W - w - 32);
      const y = 16 + rand() * Math.max(1, H - h - 32);
      if (!blocked(x, y, w, h)) return { x, y };
    }
    return null;
  };

  const makeMark = (act: Act, local: Pt[], at: Pt | null, isCta: boolean): Mark | null => {
    const b = bounds(local);
    const pad = act.size * 0.9;
    const w = Math.ceil(b.maxX - b.minX + pad * 2);
    const h = Math.ceil(b.maxY - b.minY + pad * 2);
    const origin = at ?? spot(w, h);
    if (!origin) return null;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const el = document.createElement("canvas");
    el.className = "lp-mark";
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const x = isCta ? origin.x - pad : origin.x;
    const y = isCta ? origin.y - h + pad * 0.35 : origin.y;
    el.style.transform = `translate(${x}px, ${y}px)`;
    overlay.prepend(el);
    const ctx = el.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const stroke: StrokeLike = {
      id: `pen-mark-${count++}`,
      points: local.map((p) => ({ x: p.x - b.minX + pad, y: p.y - b.minY + pad, pressure: 0.6 })),
      color: act.colors[Math.floor(rand() * act.colors.length)],
      size: act.size,
      opacity: 1,
      brushStyle: act.brush,
      timestamp: 0,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.4,
      taperStart: act.brush === "crayon" ? 6 : 0,
      taperEnd: act.brush === "crayon" ? 10 : 0,
      input: "pen",
    };
    const mark: Mark = { el, ctx, stroke, drawn: 0, x, y, born: 0, cta: isCta, fading: false, fadeAt: 0, falling: false, vx: 0, vy: 0, rot: 0, vr: 0 };
    marks.push(mark);
    while (marks.filter((m) => !m.fading && m.born).length > 7) {
      const old = marks.find((m) => !m.fading && m.born && !m.cta);
      if (!old) break;
      old.fading = true;
      old.fadeAt = performance.now();
      old.el.classList.add("lp-mark-out");
    }
    return mark;
  };

  const travel = (p: Pen, to: Pt, now: number) => {
    const dx = to.x - p.pos.x;
    const dy = to.y - p.pos.y;
    const dist = Math.hypot(dx, dy);
    p.from = { ...p.pos };
    p.to = to;
    p.ctrl = { x: p.pos.x + dx / 2 + (rand() - 0.5) * dist * 0.7, y: p.pos.y + dy / 2 + (rand() - 0.5) * dist * 0.7 };
    p.t0 = now;
    p.dur = 600 + dist * 2.2;
    p.phase = "travel";
  };

  const plan = async (p: Pen, now: number) => {
    p.phase = "rest";
    p.until = Infinity;
    let act = ACTS[Math.floor(rand() * ACTS.length)];
    let at: Pt | null = null;
    let isCta = false;
    let local = act.shape(rand);
    if (p.pine && cta && cta.offsetParent !== null && now > nextPine) {
      nextPine = now + 14000 + rand() * 8000;
      const o = overlay.getBoundingClientRect();
      const r = cta.getBoundingClientRect();
      act = PINE;
      isCta = true;
      local = shapes.line({ x: 0, y: 0 }, { x: r.width - 36, y: 0 }, 1);
      at = { x: r.left - o.left + 18, y: r.top - o.top + 2 };
    }
    await whenBrushesReady({ id: "pen", w: 1, h: 1, strokes: [{ id: "probe", points: [{ x: 0, y: 0 }], color: "#000", size: act.size, brushStyle: act.brush, timestamp: 0 }], duration: 0 });
    const mark = makeMark(act, local, at, isCta);
    if (!mark) {
      p.until = performance.now() + 600;
      return;
    }
    p.mark = mark;
    p.el.style.setProperty("--c", mark.stroke.color);
    const first = mark.stroke.points[0];
    travel(p, { x: mark.x + first.x, y: mark.y + first.y }, performance.now());
  };

  const fall = (m: Mark, dt: number) => {
    m.vy += 900 * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.rot += m.vr * dt;
    m.el.style.transform = `translate(${m.x}px, ${m.y}px) rotate(${m.rot}rad)`;
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    for (const p of pens) {
      if (p.phase === "rest") {
        if (now > p.until) void plan(p, now);
      } else if (p.phase === "travel") {
        const t = Math.min(1, (now - p.t0) / p.dur);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const u = 1 - e;
        p.pos = {
          x: u * u * p.from.x + 2 * u * e * p.ctrl.x + e * e * p.to.x,
          y: u * u * p.from.y + 2 * u * e * p.ctrl.y + e * e * p.to.y,
        };
        if (t >= 1) {
          p.phase = "draw";
          p.t0 = now;
          p.dur = p.mark!.cta ? 900 : 700 + p.mark!.stroke.points.length * 6;
        }
      } else if (p.phase === "draw" && p.mark) {
        const m = p.mark;
        const f = Math.min(1, (now - p.t0) / p.dur);
        const pts = m.stroke.points;
        const n = f >= 1 ? pts.length : Math.max(2, Math.ceil(pts.length * f));
        const last = n === pts.length;
        if (n - m.drawn >= (last ? 1 : 5)) {
          const from = last && n - m.drawn < 2 ? Math.max(0, n - 2) : m.drawn;
          renderStroke(
            m.ctx,
            {
              ...m.stroke,
              id: `${m.stroke.id}#${from}`,
              points: pts.slice(from, n),
              taperStart: from === 0 ? m.stroke.taperStart : 0,
              taperEnd: last ? m.stroke.taperEnd : 0,
            },
            landingRegistry(),
          );
          m.drawn = n;
        }
        const tip = pts[n - 1];
        p.pos = { x: m.x + tip.x, y: m.y + tip.y };
        if (f >= 1) {
          m.born = now;
          if (m.cta) squish?.kick(1.6);
          p.mark = null;
          p.phase = "rest";
          p.until = now + 300 + rand() * 900;
        }
      }
      p.el.style.transform = `translate(${p.pos.x}px, ${p.pos.y}px)`;
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      if (!m.born) continue;
      const age = now - m.born;
      if (m.cta) {
        if (!m.falling && age > 1300) {
          m.falling = true;
          m.vx = (rand() - 0.5) * 140;
          m.vy = -140 - rand() * 80;
          m.vr = (rand() - 0.5) * 6;
        }
        if (m.falling) {
          fall(m, dt);
          m.el.style.opacity = String(Math.max(0, 1 - (age - 1300) / 900));
          if (age > 2300) {
            m.el.remove();
            marks.splice(i, 1);
          }
        }
        continue;
      }
      if (!m.fading && age > 6500) {
        m.fading = true;
        m.fadeAt = now;
        m.el.classList.add("lp-mark-out");
      }
      if (m.fading && now - m.fadeAt > 1300) {
        m.el.remove();
        marks.splice(i, 1);
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
    for (const p of pens) p.el.remove();
    for (const m of marks) m.el.remove();
  };
}
