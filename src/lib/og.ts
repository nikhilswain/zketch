import { resolve } from "node:path";

const W = 1200;
const H = 630;
const PAPER = "#faf7f0";
const DOT = "#e2dacb";
const INK = "#1d1b18";
const SOFT = "#4b4740";
const CORAL = "#ff6b5b";
const CORAL_TEXT = "#e8503f";
const TAPE = "#f2d27a";
const SWOOSH = "M14 66 C26 30 46 30 50 50 C54 70 72 70 86 34";

export const OG_FONTS = [resolve("src/assets/og/Fraunces-SemiBold.ttf"), resolve("src/assets/og/Kalam-Bold.ttf")];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

type P = { x: number; y: number };

const f = (n: number) => n.toFixed(1);

const curve = (pts: P[], closed = false) => {
  const p = closed ? [...pts, pts[0], pts[1]] : pts;
  let d = `M${f(p[0].x)} ${f(p[0].y)}`;
  const last = closed ? p.length - 2 : p.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = p[i - 1] ?? (closed ? pts[pts.length - 1] : p[i]);
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
};

const place = (pts: [number, number][], ox: number, oy: number, k: number): P[] => pts.map(([x, y]) => ({ x: ox + x * k, y: oy + y * k }));

const ink = (d: string, width = 5, color = INK) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const wash = (d: string, color: string, opacity = 0.62) => `<path d="${d}" fill="${color}" fill-opacity="${opacity}" filter="url(#wash)"/>`;

const text = (s: string, x: number, y: number, size: number, opts: { font?: "display" | "hand"; fill?: string; anchor?: string; rotate?: number } = {}) =>
  `<text x="${x}" y="${y}" font-family="${opts.font === "display" ? "Fraunces 144pt" : "Kalam"}" font-weight="${opts.font === "display" ? 600 : 700}" font-size="${size}" fill="${opts.fill ?? INK}" text-anchor="${opts.anchor ?? "start"}"${opts.rotate ? ` transform="rotate(${opts.rotate} ${x} ${y})"` : ""}>${esc(s)}</text>`;

const mark = (x: number, y: number, size: number) => {
  const s = size / 100;
  const line = (extra: string) => `<path d="${SWOOSH}" ${extra} fill="none" stroke="${CORAL}" stroke-width="10" stroke-linecap="round"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">${line('transform="translate(-8 4)" stroke-opacity="0.22"')}${line('transform="translate(-4 2)" stroke-opacity="0.45"')}${line("")}</g>`;
};

const apple = (ox: number, oy: number, k: number) => {
  const body = place(
    [
      [100, 62],
      [70, 48],
      [40, 70],
      [36, 115],
      [58, 160],
      [85, 174],
      [100, 166],
      [115, 174],
      [142, 160],
      [164, 115],
      [160, 70],
      [130, 48],
    ],
    ox,
    oy,
    k,
  );
  const leaf = place(
    [
      [104, 42],
      [124, 24],
      [150, 28],
      [128, 48],
    ],
    ox,
    oy,
    k,
  );
  const stem = place(
    [
      [100, 62],
      [101, 44],
      [104, 26],
    ],
    ox,
    oy,
    k,
  );
  const shine = place(
    [
      [56, 108],
      [60, 92],
      [72, 82],
    ],
    ox,
    oy,
    k,
  );
  return wash(curve(body, true), "#e5483b") + wash(curve(leaf, true), "#4f9d4a") + ink(curve(body, true)) + ink(curve(stem)) + ink(curve(leaf, true)) + ink(curve(shine), 3.5);
};

const sun = (cx: number, cy: number, r: number) => {
  const disc: P[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const w = 1 + 0.04 * Math.sin(i * 2.3);
    disc.push({ x: cx + Math.cos(a) * r * w, y: cy + Math.sin(a) * r * w });
  }
  let rays = "";
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const r1 = r + 14;
    const r2 = r + (i % 2 ? 30 : 40);
    rays += `M${f(cx + Math.cos(a) * r1)} ${f(cy + Math.sin(a) * r1)}L${f(cx + Math.cos(a + 0.05) * r2)} ${f(cy + Math.sin(a + 0.05) * r2)}`;
  }
  const smile: P[] = [
    { x: cx - r * 0.42, y: cy + r * 0.18 },
    { x: cx, y: cy + r * 0.48 },
    { x: cx + r * 0.42, y: cy + r * 0.18 },
  ];
  const eye = (x: number) => `M${f(x)} ${f(cy - r * 0.22)}l0.1 0.1`;
  return wash(curve(disc, true), "#f2c230", 0.75) + ink(curve(disc, true)) + ink(rays, 4.5) + ink(curve(smile), 4) + ink(eye(cx - r * 0.3) + eye(cx + r * 0.3), 7);
};

const star = (cx: number, cy: number, r0: number, r1: number) => {
  const pts: P[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r1 : r0;
    const a = -Math.PI / 2 + (i * Math.PI) / 5 + 0.08;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  const d = `M${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join("L")}Z`;
  return wash(d, "#f2c230", 0.7) + ink(d, 4.5);
};

const edge = (a: P, b: P, bow: number, over = 7) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const st = { x: a.x - ux * over * 0.4, y: a.y - uy * over * 0.4 };
  const en = { x: b.x + ux * over, y: b.y + uy * over };
  const c = { x: (a.x + b.x) / 2 - uy * bow, y: (a.y + b.y) / 2 + ux * bow };
  return `M${f(st.x)} ${f(st.y)}Q${f(c.x)} ${f(c.y)} ${f(en.x)} ${f(en.y)}`;
};

const box = (x: number, y: number, w: number, h: number) =>
  ink(
    [
      edge({ x, y }, { x: x + w, y: y + 1 }, 2.5),
      edge({ x: x + w, y: y - 2 }, { x: x + w - 1, y: y + h }, -2),
      edge({ x: x + w + 2, y: y + h }, { x: x - 1, y: y + h - 1 }, 3),
      edge({ x, y: y + h + 3 }, { x: x + 1, y: y - 2 }, -2.5),
    ].join(""),
  );

const arrow = (a: P, c: P, b: P) => {
  const ang = Math.atan2(b.y - c.y, b.x - c.x);
  const arm = (side: number) => {
    const t = ang + Math.PI + side * 0.5;
    return `M${f(b.x)} ${f(b.y)}L${f(b.x + Math.cos(t) * 18)} ${f(b.y + Math.sin(t) * 18)}`;
  };
  return ink(`M${f(a.x)} ${f(a.y)}Q${f(c.x)} ${f(c.y)} ${f(b.x)} ${f(b.y)}${arm(1)}${arm(-1)}`, 4.5);
};

const blob = (cx: number, cy: number, rx: number, ry: number) => {
  const pts: P[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const w = 1 + 0.05 * Math.sin(i * 1.7 + 1);
    pts.push({ x: cx + Math.cos(a) * rx * w, y: cy + Math.sin(a) * ry * w });
  }
  return curve(pts, true);
};

const pine = (x: number, base: number, h: number) => {
  const w = h * 0.42;
  const tiers = [0, 0.32, 0.6].map((t, i) => {
    const top = base - h + t * h;
    const bw = w * (0.55 + i * 0.25);
    return `M${f(x)} ${f(top)}L${f(x - bw)} ${f(top + h * 0.42)}L${f(x + bw)} ${f(top + h * 0.42)}Z`;
  });
  return `<path d="${tiers.join("")}" fill="#2f6b3a" fill-opacity="0.85" filter="url(#wash)"/>` + ink(`M${f(x)} ${f(base - h * 0.2)}L${f(x)} ${f(base)}`, 4, "#5a3b22");
};

export function ogDefault(): string {
  const art =
    apple(780, 30, 1.05) +
    sun(1068, 132, 50) +
    wash(blob(842, 410, 92, 48), "#8ec5ea", 0.6) +
    box(752, 368, 180, 84) +
    text("idea", 842, 422, 38, { anchor: "middle" }) +
    arrow({ x: 948, y: 402 }, { x: 1040, y: 380 }, { x: 1056, y: 452 }) +
    star(1072, 520, 58, 25) +
    pine(800, 590, 74) +
    pine(846, 594, 92) +
    pine(892, 588, 66) +
    ink(curve([
      { x: 742, y: 596 },
      { x: 820, y: 586 },
      { x: 900, y: 594 },
      { x: 960, y: 586 },
    ]), 4);

  const underline = curve([
    { x: 156, y: 352 },
    { x: 212, y: 342 },
    { x: 272, y: 356 },
    { x: 334, y: 346 },
    { x: 370, y: 350 },
  ]);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.4" fill="${DOT}"/></pattern>
<filter id="wash" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="${PAPER}"/>
<rect width="${W}" height="${H}" fill="url(#dots)"/>
${mark(74, 48, 66)}
${text("zketch", 152, 96, 50, { font: "display" })}
${text("Doodle, diagram", 80, 236, 84, { font: "display" })}
${text("&", 80, 330, 84, { font: "display" })}
${text("paint,", 150, 330, 84, { font: "display", fill: CORAL_TEXT })}
${ink(underline, 7, CORAL)}
${text("right in your", 80, 424, 84, { font: "display" })}
${text("browser.", 80, 518, 84, { font: "display" })}
<g transform="rotate(-2 80 560)"><rect x="80" y="548" width="468" height="44" fill="${TAPE}"/>${text("free · no sign-up · nothing to install", 98, 580, 26, { fill: SOFT })}</g>
${art}
</svg>`;
}
