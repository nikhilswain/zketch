import { resolve } from "node:path";

const W = 1200;
const H = 630;
const PAPER = "#141416";
const DOT = "#2e2e33";
const INK = "#ecebe7";
const SOFT = "#9c9a94";
const CORAL = "#ff6b5b";
const ON_CORAL = "#141416";
const SWOOSH = "M14 66 C26 30 46 30 50 50 C54 70 72 70 86 34";

export const OG_FONTS = [resolve("src/assets/og/Fraunces-SemiBold.ttf"), resolve("src/assets/og/Kalam-Bold.ttf")];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

type P = { x: number; y: number };

const edge = (a: P, b: P, bow: number, over = 7) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const s = { x: a.x - ux * over * 0.4, y: a.y - uy * over * 0.4 };
  const e = { x: b.x + ux * over, y: b.y + uy * over };
  const c = { x: (a.x + b.x) / 2 - uy * bow, y: (a.y + b.y) / 2 + ux * bow };
  return `M${s.x.toFixed(1)} ${s.y.toFixed(1)}Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
};

const ink = (d: string, color = INK, width = 4.5) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const rect = (x: number, y: number, w: number, h: number, color = INK) =>
  ink(
    [
      edge({ x, y }, { x: x + w, y: y + 1 }, 2.5),
      edge({ x: x + w, y: y - 2 }, { x: x + w - 1, y: y + h }, -2),
      edge({ x: x + w + 2, y: y + h }, { x: x - 1, y: y + h - 1 }, 3),
      edge({ x, y: y + h + 3 }, { x: x + 1, y: y - 2 }, -2.5),
    ].join(""),
    color,
  );

const diamond = (cx: number, cy: number, hw: number, hh: number, color = INK) => {
  const t = { x: cx, y: cy - hh };
  const r = { x: cx + hw, y: cy };
  const b = { x: cx, y: cy + hh };
  const l = { x: cx - hw, y: cy };
  return ink([edge(t, r, 2.5), edge(r, b, -2), edge(b, l, 3), edge(l, t, -2.5)].join(""), color);
};

const ellipse = (cx: number, cy: number, rx: number, ry: number, color = INK) => {
  const pts: string[] = [];
  for (let k = 0; k <= 40; k++) {
    const a = -Math.PI * 0.62 + (k / 40) * Math.PI * 2.12;
    const wob = 1 + 0.035 * Math.sin(a * 3 + 1);
    pts.push(`${(cx + Math.cos(a) * rx * wob).toFixed(1)} ${(cy + Math.sin(a) * ry * wob).toFixed(1)}`);
  }
  return ink(`M${pts.join("L")}`, color);
};

const arrow = (a: P, c: P, b: P, color = INK) => {
  const ang = Math.atan2(b.y - c.y, b.x - c.x);
  const arm = (side: number) => {
    const t = ang + Math.PI + side * 0.48;
    return `M${b.x} ${b.y}L${(b.x + Math.cos(t) * 22).toFixed(1)} ${(b.y + Math.sin(t) * 22).toFixed(1)}`;
  };
  return ink(`M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}${arm(1)}${arm(-1)}`, color);
};

const text = (s: string, x: number, y: number, size: number, opts: { font?: "display" | "hand"; fill?: string; anchor?: string } = {}) =>
  `<text x="${x}" y="${y}" font-family="${opts.font === "display" ? "Fraunces 144pt" : "Kalam"}" font-weight="${opts.font === "display" ? 600 : 700}" font-size="${size}" fill="${opts.fill ?? INK}" text-anchor="${opts.anchor ?? "start"}">${esc(s)}</text>`;

const mark = (x: number, y: number, size: number) => {
  const s = size / 100;
  const line = (extra: string) => `<path d="${SWOOSH}" ${extra} fill="none" stroke="${CORAL}" stroke-width="10" stroke-linecap="round"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">${line('transform="translate(-8 4)" stroke-opacity="0.22"')}${line('transform="translate(-4 2)" stroke-opacity="0.45"')}${line("")}</g>`;
};

const button = (s: string, x: number, y: number) => {
  const w = s.length * 16.5 + 56;
  return `<g transform="rotate(-1.5 ${x} ${y})"><rect x="${x}" y="${y}" width="${w}" height="64" rx="12" fill="${CORAL}"/>${text(s, x + 28, y + 44, 34, { fill: ON_CORAL })}</g>`;
};

export function ogDefault(): string {
  const diagram =
    rect(745, 118, 200, 104) +
    text("idea", 845, 182, 40, { anchor: "middle" }) +
    arrow({ x: 960, y: 175 }, { x: 1040, y: 180 }, { x: 1030, y: 250 }) +
    ellipse(1015, 318, 112, 62) +
    text("sketch", 1015, 332, 40, { anchor: "middle" }) +
    arrow({ x: 925, y: 360 }, { x: 900, y: 420 }, { x: 860, y: 428 }) +
    diamond(790, 455, 108, 72, CORAL) +
    text("art", 790, 469, 40, { anchor: "middle", fill: CORAL });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.6" fill="${DOT}"/></pattern></defs>
<rect width="${W}" height="${H}" fill="${PAPER}"/>
<rect width="${W}" height="${H}" fill="url(#dots)"/>
${mark(84, 160, 118)}
${text("zketch", 214, 266, 132, { font: "display" })}
${text("doodle, diagram and paint", 92, 360, 46)}
${text("free in your browser, no sign-up", 92, 414, 38, { fill: SOFT })}
${button("start drawing", 94, 450)}
${diagram}
</svg>`;
}
