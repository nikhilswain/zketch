type Mode = "light" | "dark";

const KEY = "zketch-landing-theme";
const PAPER: Record<Mode, string> = { light: "#faf7f0", dark: "#1b1916" };
const HANDLE = "#ff6b5b";
const WIRE = "#8b8578";

type Pt = { x: number; y: number };
type Seg = {
  dur: number;
  from: Pt;
  to: Pt;
  band?: number;
  down?: boolean;
  dab?: boolean;
  grow?: boolean;
};
type Streak = { x: number; y: number; w: number; h: number; born: number };
type Fleck = { x: number; y: number; r: number; born: number };

let active: ViewTransition | null = null;

export function landingMode(): Mode {
  return document.documentElement.dataset.lpTheme === "dark" ? "dark" : "light";
}

function apply(mode: Mode) {
  document.documentElement.dataset.lpTheme = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    return;
  }
}

function label(btn: HTMLButtonElement) {
  const dark = landingMode() === "dark";
  btn.setAttribute("aria-label", dark ? "Paint the page light" : "Paint the page dark");
  btn.title = dark ? "Paint it light" : "Paint it dark";
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function plan(W: number, H: number, start: Pt) {
  const n = W < 640 ? 3 : 4;
  const bandW = W / n;
  const rw = bandW * 1.14;
  const rh = W < 640 ? 34 : 44;
  const top = -rh * 2;
  const bottom = H + rh * 4.5;
  const stroke = Math.max(230, Math.min(380, H * 0.36));
  const xs = Array.from({ length: n }, (_, i) => bandW * (i + 0.5) + (i % 2 ? -6 : 6));
  const segs: Seg[] = [];
  segs.push({ dur: 300, from: start, to: { x: xs[0], y: top }, grow: true });
  for (let i = 0; i < n; i++) {
    const down = i % 2 === 0;
    const a = { x: xs[i], y: down ? top : bottom };
    const b = { x: xs[i] + (down ? 10 : -10), y: down ? bottom : top };
    segs.push({ dur: stroke, from: a, to: b, band: i, down });
    if (i < n - 1) segs.push({ dur: 90, from: b, to: { x: xs[i + 1], y: b.y } });
  }
  const spot = { x: xs[1] - bandW * 0.12, y: H * 0.58 };
  const spotR = Math.max(30, bandW * 0.16);
  const rest = { x: spot.x, y: spot.y + spotR * 0.7 };
  const last = segs[segs.length - 1].to;
  segs.push({ dur: 140, from: last, to: last });
  segs.push({ dur: 340, from: last, to: rest });
  segs.push({ dur: 460, from: rest, to: rest, dab: true });
  segs.push({ dur: 280, from: rest, to: { x: W + rw, y: -rh * 6 } });
  segs.push({ dur: 260, from: { x: W + rw, y: -rh * 6 }, to: { x: W + rw, y: -rh * 6 } });
  const total = segs.reduce((s, g) => s + g.dur, 0);
  return { n, rw, rh, xs, segs, spot, spotR, total, top, bottom };
}

function wobble(seed: number, y: number) {
  return 3.2 * Math.sin(y * 0.045 + seed) + 1.8 * Math.sin(y * 0.13 + seed * 2.7) + 1.1 * Math.sin(y * 0.31 + seed * 5.1);
}

function bandPath(x: number, rw: number, y0: number, y1: number, seed: number) {
  const step = 22;
  const left: string[] = [];
  const right: string[] = [];
  for (let y = y0; y < y1; y += step) {
    left.push(`${(x - rw / 2 + wobble(seed, y)).toFixed(1)} ${y.toFixed(1)}`);
    right.push(`${(x + rw / 2 + wobble(seed + 9, y)).toFixed(1)} ${y.toFixed(1)}`);
  }
  left.push(`${(x - rw / 2 + wobble(seed, y1)).toFixed(1)} ${y1.toFixed(1)}`);
  right.push(`${(x + rw / 2 + wobble(seed + 9, y1)).toFixed(1)} ${y1.toFixed(1)}`);
  return `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
}

function holePath(c: Pt, r: number, lo: number, hi: number) {
  const pts: string[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rr = r * (1 + 0.22 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 7));
    const y = Math.max(lo, Math.min(hi, c.y + Math.sin(a) * rr));
    pts.push(`${(c.x + Math.cos(a) * rr * 1.3).toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

function drawRoller(ctx: CanvasRenderingContext2D, c: Pt, rw: number, rh: number, paint: string, tilt: number, scale: number) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(tilt);
  ctx.scale(scale, scale);
  const hx = rw / 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = WIRE;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(hx, 0);
  ctx.lineTo(hx + 12, 0);
  ctx.lineTo(hx + 12, rh * 1.25);
  ctx.lineTo(rw * 0.12, rh * 2.1);
  ctx.lineTo(rw * 0.12, rh * 2.5);
  ctx.stroke();
  ctx.fillStyle = HANDLE;
  ctx.strokeStyle = "#1d1b18";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(rw * 0.12 - 9, rh * 2.45, 18, rh * 2.2, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = paint;
  ctx.beginPath();
  ctx.roundRect(-hx, -rh / 2, rw, rh, 9);
  ctx.fill();
  const g = ctx.createLinearGradient(0, -rh / 2, 0, rh / 2);
  g.addColorStop(0, "rgba(255,255,255,0.28)");
  g.addColorStop(0.35, "rgba(255,255,255,0.06)");
  g.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(29,27,24,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = WIRE;
  ctx.beginPath();
  ctx.ellipse(hx, 0, 4, rh / 2 - 3, 0, 0, Math.PI * 2);
  ctx.ellipse(-hx, 0, 4, rh / 2 - 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paint(to: Mode, btn: HTMLButtonElement) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduce) {
    apply(to);
    label(btn);
    return;
  }
  const from: Mode = to === "dark" ? "light" : "dark";
  const W = window.innerWidth;
  const H = window.innerHeight;
  const r = btn.getBoundingClientRect();
  const p = plan(W, H, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const layer = document.createElement("canvas");
  layer.className = "lp-roller-layer";
  layer.width = Math.round(W * dpr);
  layer.height = Math.round(H * dpr);
  const ctx = layer.getContext("2d")!;
  const clip = document.createElement("style");
  clip.textContent = "::view-transition-new(root){clip-path:inset(0 0 100% 0)}";
  document.head.append(clip);
  document.documentElement.classList.add("lp-painting");

  const t = document.startViewTransition(() => {
    apply(to);
    label(btn);
    document.body.append(layer);
  });
  active = t;

  const streaks: Streak[] = [];
  const flecks: Fleck[] = [];
  const seeds = Array.from({ length: p.n }, () => Math.random() * 100);
  let raf = 0;
  let t0 = 0;
  let prev: Pt | null = null;

  const frame = (now: number) => {
    if (!t0) t0 = now;
    const el = now - t0;
    let acc = 0;
    let seg = p.segs[p.segs.length - 1];
    let k = 1;
    for (const s of p.segs) {
      if (el < acc + s.dur) {
        seg = s;
        k = (el - acc) / s.dur;
        break;
      }
      acc += s.dur;
    }
    const e = seg.band !== undefined ? k : ease(k);
    const pos = { x: lerp(seg.from.x, seg.to.x, e), y: lerp(seg.from.y, seg.to.y, e) };
    if (seg.dab) pos.y = seg.from.y - p.spotR * 1.5 * Math.abs(Math.sin(k * Math.PI * 2));

    const paths: string[] = [];
    let hole: [number, number] | null = null;
    let dabbed = false;
    let holeScale = 1;
    for (const s of p.segs) {
      const idx = p.segs.indexOf(s);
      const segStart = p.segs.slice(0, idx).reduce((a, g) => a + g.dur, 0);
      if (s.dab) {
        if (el >= segStart + s.dur) dabbed = true;
        else if (el > segStart) holeScale = 1 - ease(Math.min(1, (el - segStart) / (s.dur * 0.85)));
      }
      if (s.band !== 1 || el < segStart) continue;
      if (el >= segStart + s.dur) hole = [-20, H + 20];
      else hole = s.down ? [-20, pos.y] : [pos.y, H + 20];
    }
    for (const s of p.segs) {
      if (s.band === undefined) continue;
      const idx = p.segs.indexOf(s);
      const segStart = p.segs.slice(0, idx).reduce((a, g) => a + g.dur, 0);
      if (el < segStart) break;
      const done = el >= segStart + s.dur;
      const x = p.xs[s.band];
      if (done) paths.push(bandPath(x, p.rw, -20, H + 20, seeds[s.band]));
      else if (s.down) paths.push(bandPath(x, p.rw, -20, Math.max(-20, pos.y), seeds[s.band]));
      else paths.push(bandPath(x, p.rw, Math.min(H + 20, pos.y), H + 20, seeds[s.band]));
    }
    if (hole && !dabbed && holeScale > 0.02) paths.push(holePath(p.spot, p.spotR * holeScale, hole[0], hole[1]));
    clip.textContent = paths.length
      ? `::view-transition-new(root){clip-path:path("${paths.join(" ")}")}`
      : "::view-transition-new(root){clip-path:inset(0 0 100% 0)}";

    if (seg.band !== undefined && k > 0.5 && pos.y > 0 && pos.y < H) {
      const dry = (k - 0.5) * 2;
      const count = Math.random() < dry ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const len = 18 + Math.random() * 70 * dry;
        streaks.push({
          x: p.xs[seg.band] + (Math.random() - 0.5) * p.rw * 0.8,
          y: seg.down ? pos.y - len - p.rh / 2 : pos.y + p.rh / 2,
          w: 1.5 + Math.random() * 4 * dry,
          h: len,
          born: el,
        });
      }
    }
    if (seg.band !== undefined && pos.y > 0 && pos.y < H) {
      for (let i = 0; i < 3; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        flecks.push({
          x: p.xs[seg.band] + side * (p.rw / 2 + Math.random() * 7),
          y: pos.y + (Math.random() - 0.5) * p.rh,
          r: 0.6 + Math.random() * 1.8,
          born: el,
        });
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER[from];
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      const a = 0.9 * (1 - (el - s.born) / 650);
      if (a <= 0) {
        streaks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.roundRect(s.x, s.y, s.w, s.h, s.w / 2);
      ctx.fill();
    }
    ctx.fillStyle = PAPER[to];
    for (let i = flecks.length - 1; i >= 0; i--) {
      const f = flecks[i];
      const a = 1 - (el - f.born) / 500;
      if (a <= 0) {
        flecks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (seg.band !== undefined) {
      const g = ctx.createLinearGradient(0, pos.y, 0, seg.down ? pos.y - 160 : pos.y + 160);
      g.addColorStop(0, to === "dark" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      const x = p.xs[seg.band];
      ctx.fillRect(x - p.rw / 2, seg.down ? pos.y - 160 : pos.y, p.rw, 160);
    }
    const vx = prev ? pos.x - prev.x : 0;
    prev = pos;
    const scale = seg.grow ? lerp(0.22, 1, ease(k)) : 1;
    drawRoller(ctx, pos, p.rw, p.rh, PAPER[to], Math.max(-0.25, Math.min(0.25, vx * 0.004)), scale);

    if (el < p.total) raf = requestAnimationFrame(frame);
  };

  t.ready
    .then(() => {
      document.documentElement.animate({ opacity: [1, 1] }, { duration: p.total, pseudoElement: "::view-transition-new(root)" });
      raf = requestAnimationFrame(frame);
    })
    .catch(() => undefined);

  t.finished.finally(() => {
    cancelAnimationFrame(raf);
    layer.remove();
    clip.remove();
    document.documentElement.classList.remove("lp-painting");
    active = null;
  });
}

export function installRoller() {
  const btn = document.querySelector<HTMLButtonElement>("[data-lp-theme-toggle]");
  if (!btn) return;
  label(btn);
  btn.addEventListener("click", () => {
    if (active) {
      active.skipTransition();
      return;
    }
    paint(landingMode() === "dark" ? "light" : "dark", btn);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && active) active.skipTransition();
  });
}
