import type { BrushStyle, StrokeLike } from "@/engine/types";
import { Pen, fill, mulberry, shapes, type PenStyle, type Pt } from "./pen";

export { mulberry };
export type { Pt };

export type DoodleMode = "normal" | "watercolor";

export interface Doodle {
  id: string;
  w: number;
  h: number;
  strokes: StrokeLike[];
  duration: number;
}

export interface DoodleDef {
  id: string;
  hero: boolean;
  make(seed: number, mode?: DoodleMode): Doodle;
}

type FillBrush = "watercolor" | "gouache" | "crayon" | "marker";

interface Kit {
  r: () => number;
  pick<T>(xs: readonly T[]): T;
  colored: boolean;
  out(path: Pt[], o?: Partial<PenStyle>): void;
  paint(poly: Pt[], color: string, o?: { brush?: FillBrush; gap?: number; angle?: number; size?: number }): void;
  shade(poly: Pt[], color: string, angle?: number): void;
  stamp(path: Pt[], brush: BrushStyle, color: string, size: number): void;
}

interface Spec {
  id: string;
  hero?: boolean;
  outline: "ink" | "pencil" | "marker";
  ink?: string;
  colorChance?: number;
  fills?: readonly FillBrush[];
  w?: number;
  h?: number;
  draw(k: Kit): void;
}

export const INK = "#23201c";

const C = {
  red: "#e5483b",
  green: "#4f9d4a",
  lime: "#8cc152",
  yellow: "#f2c230",
  blue: "#3d7cc9",
  sky: "#8ec5ea",
  orange: "#f08a2c",
  pink: "#ef7aa0",
  brown: "#8a5a3b",
  purple: "#8a63c9",
  grey: "#9aa0a6",
  teal: "#2aa198",
  cream: "#f1e3c8",
  skin: "#f6c89f",
  terracotta: "#d9774b",
};

const FILL_STYLE: Record<FillBrush, { size: number; opacity: number; gap: number; speed: number }> = {
  watercolor: { size: 22, opacity: 0.8, gap: 11, speed: 1.6 },
  gouache: { size: 14, opacity: 0.92, gap: 8, speed: 1.4 },
  crayon: { size: 9, opacity: 0.9, gap: 5.5, speed: 1.5 },
  marker: { size: 10, opacity: 0.8, gap: 6.5, speed: 1.4 },
};

const OUTLINE_STYLE: Record<Spec["outline"], Omit<PenStyle, "color">> = {
  ink: { brush: "ink", size: 4.5, taper: [14, 20] },
  pencil: { brush: "pencil", size: 3.5, opacity: 0.95, taper: [10, 14] },
  marker: { brush: "marker", size: 5, opacity: 0.95 },
};

function blob(cx: number, cy: number, rx: number, ry: number, bumps: number, depth: number, phase = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2 - Math.PI / 2;
    const k = 1 - depth + depth * Math.sqrt(Math.abs(Math.sin((a * bumps) / 2 + phase)));
    out.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return out;
}

function rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ];
}

function petal(cx: number, cy: number, angle: number, len: number, wid: number): Pt[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const local: Pt[] = [
    { x: 0, y: 0 },
    { x: len * 0.35, y: -wid },
    { x: len * 0.85, y: -wid * 0.7 },
    { x: len, y: 0 },
    { x: len * 0.85, y: wid * 0.7 },
    { x: len * 0.35, y: wid },
    { x: 0, y: 0 },
  ];
  return shapes.curve(local.map((p) => ({ x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c })));
}

function heartPath(cx: number, cy: number, k: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = (i / 80) * Math.PI * 2 + Math.PI;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push({ x: cx + x * k, y: cy - y * k });
  }
  return out;
}

function starPath(cx: number, cy: number, r0: number, r1: number, points = 5, rot = -Math.PI / 2): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 === 0 ? r0 : r1;
    const a = rot + (i * Math.PI) / points;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

function arrowHead(from: Pt, to: Pt, len = 14): Pt[] {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return [
    { x: to.x - Math.cos(a - 0.45) * len, y: to.y - Math.sin(a - 0.45) * len },
    to,
    { x: to.x - Math.cos(a + 0.45) * len, y: to.y - Math.sin(a + 0.45) * len },
  ];
}

const SPECS: Spec[] = [
  {
    id: "apple",
    outline: "ink",
    colorChance: 0.9,
    draw(k) {
      const body = shapes.curve([
        { x: 100, y: 62 },
        { x: 70, y: 48 },
        { x: 40, y: 70 },
        { x: 36, y: 115 },
        { x: 58, y: 160 },
        { x: 85, y: 174 },
        { x: 100, y: 166 },
        { x: 115, y: 174 },
        { x: 142, y: 160 },
        { x: 164, y: 115 },
        { x: 160, y: 70 },
        { x: 130, y: 48 },
        { x: 100, y: 62 },
      ]);
      const leaf = shapes.curve([
        { x: 104, y: 42 },
        { x: 124, y: 24 },
        { x: 150, y: 28 },
        { x: 128, y: 48 },
        { x: 104, y: 42 },
      ]);
      k.out(body);
      k.out(shapes.line({ x: 100, y: 62 }, { x: 103, y: 26 }, 3));
      k.out(leaf);
      k.out(shapes.arc(68, 98, 16, Math.PI * 1.05, Math.PI * 1.45), { size: 3 });
      if (k.colored) {
        k.paint(body, k.pick([C.red, C.red, C.lime]));
        k.paint(leaf, C.green, { brush: "crayon" });
        k.shade(shapes.ellipse(128, 128, 22, 30, 0), "#a3261d");
      }
    },
  },
  {
    id: "tree",
    outline: "ink",
    colorChance: 0.85,
    draw(k) {
      const canopy = blob(100, 82, 66, 58, 8, 0.22, k.r());
      k.out(canopy);
      k.out(shapes.line({ x: 90, y: 186 }, { x: 93, y: 134 }, 2));
      k.out(shapes.line({ x: 112, y: 186 }, { x: 108, y: 134 }, -2));
      k.out(shapes.line({ x: 40, y: 188 }, { x: 162, y: 186 }, 2), { size: 3.5 });
      if (k.colored) {
        k.paint(canopy, k.pick([C.green, C.lime]));
        k.paint(rect(91, 136, 110, 184), C.brown, { brush: "crayon" });
        if (k.r() < 0.6) {
          for (const [x, y] of [
            [76, 70],
            [120, 60],
            [110, 104],
            [70, 108],
          ])
            k.paint(shapes.ellipse(x, y, 7, 7, 0), C.red, { brush: "marker", size: 7, gap: 4 });
        }
      }
    },
  },
  {
    id: "face",
    outline: "marker",
    colorChance: 0.6,
    draw(k) {
      const head = shapes.ellipse(100, 108, 62, 70, 0.3);
      k.out(head);
      for (const [x, y, d] of [
        [70, 52, -1],
        [92, 42, -1],
        [114, 42, 1],
        [134, 52, 1],
      ])
        k.out(shapes.arc(x + d * 4, y - 8, 9, Math.PI * 0.6, Math.PI * 2.1), { size: 4 });
      k.out(shapes.ellipse(78, 98, 8, 11, 0.2));
      k.out(shapes.ellipse(122, 98, 8, 11, 0.2));
      k.out(shapes.ellipse(80, 101, 2.5, 3, 0.4), { size: 4 });
      k.out(shapes.ellipse(124, 101, 2.5, 3, 0.4), { size: 4 });
      k.out(shapes.arc(100, 120, 30, Math.PI * 0.15, Math.PI * 0.85));
      if (k.colored) {
        k.paint(head, C.skin, { brush: "gouache" });
        k.paint(shapes.ellipse(64, 128, 10, 7, 0), C.pink, { brush: "crayon" });
        k.paint(shapes.ellipse(136, 128, 10, 7, 0), C.pink, { brush: "crayon" });
      }
    },
  },
  {
    id: "cat",
    outline: "ink",
    colorChance: 0.8,
    draw(k) {
      const head = shapes.ellipse(100, 124, 58, 46, 0.25);
      k.out(head);
      k.out(shapes.poly([
        { x: 54, y: 102 },
        { x: 58, y: 54 },
        { x: 86, y: 82 },
      ]));
      k.out(shapes.poly([
        { x: 114, y: 82 },
        { x: 142, y: 54 },
        { x: 146, y: 102 },
      ]));
      k.out(shapes.arc(80, 118, 8, Math.PI * 1.1, Math.PI * 1.9));
      k.out(shapes.arc(120, 118, 8, Math.PI * 1.1, Math.PI * 1.9));
      k.out(shapes.poly([
        { x: 94, y: 130 },
        { x: 106, y: 130 },
        { x: 100, y: 138 },
      ], true), { size: 3.5 });
      k.out(shapes.curve([
        { x: 86, y: 146 },
        { x: 93, y: 152 },
        { x: 100, y: 144 },
        { x: 107, y: 152 },
        { x: 114, y: 146 },
      ]), { size: 3.5 });
      for (const [y, dy] of [
        [134, -6],
        [142, 0],
        [150, 6],
      ]) {
        k.out(shapes.line({ x: 72, y }, { x: 26, y: y + dy }, 2), { size: 2.5 });
        k.out(shapes.line({ x: 128, y }, { x: 174, y: y + dy }, -2), { size: 2.5 });
      }
      if (k.colored) {
        const fur = k.pick([C.orange, C.grey, C.orange]);
        k.paint(head, fur);
        k.paint(shapes.poly([
          { x: 60, y: 96 },
          { x: 62, y: 66 },
          { x: 80, y: 84 },
        ], true), C.pink, { brush: "crayon" });
        k.paint(shapes.poly([
          { x: 120, y: 84 },
          { x: 138, y: 66 },
          { x: 140, y: 96 },
        ], true), C.pink, { brush: "crayon" });
      }
    },
  },
  {
    id: "coffee",
    outline: "ink",
    colorChance: 0.85,
    draw(k) {
      const cup = shapes.curve([
        { x: 54, y: 92 },
        { x: 60, y: 140 },
        { x: 72, y: 168 },
        { x: 128, y: 168 },
        { x: 140, y: 140 },
        { x: 146, y: 92 },
      ]);
      k.out(shapes.ellipse(100, 92, 46, 11, 0.2));
      k.out(cup);
      k.out(shapes.arc(146, 124, 18, -Math.PI / 2, Math.PI / 2));
      k.out(shapes.ellipse(100, 174, 66, 11, 0.2), { size: 3.5 });
      for (const x of [80, 100, 120]) {
        k.out(shapes.curve([
          { x, y: 72 },
          { x: x - 7, y: 58 },
          { x: x + 4, y: 44 },
          { x: x - 4, y: 26 },
        ]), { size: 3 });
      }
      if (k.colored) {
        k.paint([...cup, { x: 54, y: 92 }], k.pick([C.blue, C.red, C.teal]));
        k.paint(shapes.ellipse(100, 92, 40, 7, 0), C.brown, { brush: "gouache", size: 9, gap: 5 });
      }
    },
  },
  {
    id: "house",
    outline: "ink",
    colorChance: 0.85,
    draw(k) {
      const roof: Pt[] = [
        { x: 38, y: 102 },
        { x: 100, y: 40 },
        { x: 162, y: 102 },
      ];
      k.out(shapes.poly(roof, true));
      k.out(rect(50, 102, 150, 176));
      k.out(rect(88, 132, 112, 176));
      k.out(rect(62, 114, 80, 132));
      k.out(rect(120, 114, 138, 132));
      k.out(shapes.poly([
        { x: 124, y: 64 },
        { x: 124, y: 44 },
        { x: 138, y: 44 },
        { x: 138, y: 78 },
      ]), { size: 3.5 });
      if (k.colored) {
        k.paint(shapes.poly(roof, true), C.red);
        k.paint(rect(52, 104, 148, 174), k.pick([C.yellow, C.cream, C.sky]));
        k.paint(rect(90, 134, 110, 174), C.brown, { brush: "crayon" });
      }
    },
  },
  {
    id: "rocket",
    outline: "ink",
    colorChance: 0.9,
    draw(k) {
      const body = shapes.curve([
        { x: 100, y: 22 },
        { x: 124, y: 55 },
        { x: 130, y: 108 },
        { x: 122, y: 140 },
        { x: 78, y: 140 },
        { x: 70, y: 108 },
        { x: 76, y: 55 },
        { x: 100, y: 22 },
      ]);
      const finL: Pt[] = [
        { x: 76, y: 112 },
        { x: 52, y: 152 },
        { x: 80, y: 140 },
      ];
      const finR: Pt[] = [
        { x: 124, y: 112 },
        { x: 148, y: 152 },
        { x: 120, y: 140 },
      ];
      const flame = shapes.curve([
        { x: 86, y: 144 },
        { x: 90, y: 166 },
        { x: 100, y: 186 },
        { x: 110, y: 166 },
        { x: 114, y: 144 },
      ]);
      k.out(body);
      k.out(shapes.ellipse(100, 78, 13, 13, 0.3));
      k.out(shapes.poly(finL));
      k.out(shapes.poly(finR));
      k.out(flame, { size: 3.5 });
      if (k.colored) {
        k.paint(body, k.pick([C.teal, C.cream, C.sky]));
        k.paint(shapes.ellipse(100, 78, 10, 10, 0), C.blue, { brush: "marker", size: 7, gap: 4 });
        k.paint(shapes.poly(finL, true), C.red, { brush: "crayon" });
        k.paint(shapes.poly(finR, true), C.red, { brush: "crayon" });
        k.paint(flame, C.orange);
      }
    },
  },
  {
    id: "sun",
    outline: "marker",
    colorChance: 0.95,
    draw(k) {
      const disc = shapes.ellipse(100, 100, 40, 40, 0.3);
      k.out(disc);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + k.r() * 0.15;
        const r1 = i % 2 ? 72 : 82;
        k.out(shapes.line({ x: 100 + Math.cos(a) * 52, y: 100 + Math.sin(a) * 52 }, { x: 100 + Math.cos(a) * r1, y: 100 + Math.sin(a) * r1 }), { size: 4.5 });
      }
      k.out(shapes.arc(100, 104, 18, Math.PI * 0.2, Math.PI * 0.8), { size: 4 });
      k.out(shapes.ellipse(88, 92, 2.5, 3, 0.3), { size: 4 });
      k.out(shapes.ellipse(112, 92, 2.5, 3, 0.3), { size: 4 });
      if (k.colored) k.paint(disc, C.yellow);
    },
  },
  {
    id: "flower",
    outline: "pencil",
    colorChance: 0.9,
    draw(k) {
      const cx = 100;
      const cy = 78;
      const petals = Array.from({ length: 6 }, (_, i) => petal(cx, cy, (i / 6) * Math.PI * 2 + 0.2, 52, 16));
      k.out(shapes.curve([
        { x: 100, y: 96 },
        { x: 96, y: 140 },
        { x: 102, y: 188 },
      ]));
      const leaf = petal(98, 156, -0.6, 40, 12);
      k.out(leaf);
      for (const p of petals) k.out(p);
      k.out(shapes.ellipse(cx, cy, 13, 13, 0.3));
      if (k.colored) {
        const tone = k.pick([C.pink, C.purple, C.yellow, C.red]);
        for (const p of petals) k.paint(p, tone, { brush: k.pick(["watercolor", "gouache"] as const) });
        k.paint(shapes.ellipse(cx, cy, 11, 11, 0), C.orange, { brush: "crayon" });
        k.paint(leaf, C.green, { brush: "crayon" });
      }
    },
  },
  {
    id: "fish",
    outline: "ink",
    colorChance: 0.9,
    draw(k) {
      const body = shapes.curve([
        { x: 36, y: 100 },
        { x: 78, y: 64 },
        { x: 128, y: 72 },
        { x: 150, y: 100 },
        { x: 128, y: 128 },
        { x: 78, y: 136 },
        { x: 36, y: 100 },
      ]);
      const tail: Pt[] = [
        { x: 150, y: 100 },
        { x: 180, y: 70 },
        { x: 172, y: 100 },
        { x: 180, y: 130 },
        { x: 150, y: 100 },
      ];
      k.out(body);
      k.out(shapes.poly(tail));
      k.out(shapes.arc(96, 100, 26, -Math.PI * 0.35, Math.PI * 0.35));
      k.out(shapes.ellipse(64, 94, 5, 5, 0.3), { size: 4 });
      k.out(shapes.ellipse(40, 56, 7, 7, 0.3), { size: 3 });
      k.out(shapes.ellipse(28, 36, 4, 4, 0.3), { size: 3 });
      if (k.colored) {
        const tone = k.pick([C.orange, C.blue, C.teal]);
        k.paint(body, tone);
        k.paint(tail, tone, { brush: "crayon" });
      }
    },
  },
  {
    id: "rain-cloud",
    outline: "ink",
    colorChance: 0.85,
    draw(k) {
      const cloud = blob(100, 76, 70, 40, 7, 0.28, k.r());
      k.out(cloud);
      for (let i = 0; i < 6; i++) {
        const x = 52 + i * 19;
        const y = 132 + (i % 2) * 14;
        k.out(shapes.line({ x, y }, { x: x - 8, y: y + 26 }), { size: 3.5, color: C.blue });
      }
      if (k.colored) k.paint(cloud, k.pick(["#b9c7d6", C.grey, C.sky]));
    },
  },
  {
    id: "mushroom",
    outline: "pencil",
    colorChance: 0.9,
    draw(k) {
      const cap = [...shapes.arc(100, 102, 70, Math.PI, Math.PI * 2, 62), { x: 30, y: 102 }];
      const stem = shapes.curve([
        { x: 82, y: 104 },
        { x: 78, y: 150 },
        { x: 84, y: 180 },
        { x: 116, y: 180 },
        { x: 122, y: 150 },
        { x: 118, y: 104 },
      ]);
      k.out(cap);
      k.out(stem);
      const spots = [
        [72, 74, 10],
        [108, 58, 12],
        [138, 84, 9],
      ];
      for (const [x, y, r] of spots) k.out(shapes.ellipse(x, y, r, r * 0.85, 0.3), { size: 3 });
      if (k.colored) {
        k.paint(cap, k.pick([C.red, C.orange]));
        k.paint([...stem, { x: 82, y: 104 }], C.cream, { brush: "gouache" });
      }
    },
  },
  {
    id: "snail",
    outline: "pencil",
    colorChance: 0.85,
    draw(k) {
      const spiral: Pt[] = [];
      for (let i = 0; i <= 120; i++) {
        const t = i / 120;
        const a = -Math.PI / 2 + t * Math.PI * 5;
        const r = 46 * (1 - t) + 4;
        spiral.push({ x: 112 + Math.cos(a) * r, y: 106 + Math.sin(a) * r });
      }
      const foot = shapes.curve([
        { x: 182, y: 160 },
        { x: 120, y: 154 },
        { x: 64, y: 152 },
        { x: 46, y: 132 },
        { x: 40, y: 108 },
        { x: 54, y: 100 },
        { x: 62, y: 116 },
        { x: 66, y: 146 },
        { x: 70, y: 166 },
        { x: 140, y: 168 },
        { x: 182, y: 160 },
      ]);
      k.out(foot);
      k.out(spiral);
      k.out(shapes.line({ x: 46, y: 104 }, { x: 34, y: 74 }, 3), { size: 3 });
      k.out(shapes.line({ x: 54, y: 101 }, { x: 62, y: 72 }, -3), { size: 3 });
      k.out(shapes.ellipse(34, 72, 3, 3, 0.3), { size: 3 });
      k.out(shapes.ellipse(62, 70, 3, 3, 0.3), { size: 3 });
      k.out(shapes.ellipse(50, 116, 2, 2.5, 0.3), { size: 3.5 });
      if (k.colored) {
        k.paint(shapes.ellipse(112, 106, 48, 48, 0), k.pick([C.orange, C.brown, C.purple]));
        k.paint(foot, C.lime, { brush: "crayon" });
      }
    },
  },
  {
    id: "cactus",
    outline: "pencil",
    colorChance: 0.9,
    draw(k) {
      const body = shapes.curve([
        { x: 84, y: 170 },
        { x: 82, y: 70 },
        { x: 100, y: 40 },
        { x: 118, y: 70 },
        { x: 116, y: 170 },
      ]);
      const armL = shapes.curve([
        { x: 84, y: 126 },
        { x: 58, y: 124 },
        { x: 52, y: 92 },
        { x: 64, y: 88 },
        { x: 70, y: 110 },
        { x: 84, y: 110 },
      ]);
      const armR = shapes.curve([
        { x: 116, y: 116 },
        { x: 140, y: 112 },
        { x: 146, y: 78 },
        { x: 134, y: 76 },
        { x: 130, y: 98 },
        { x: 116, y: 100 },
      ]);
      const pot: Pt[] = [
        { x: 66, y: 168 },
        { x: 134, y: 168 },
        { x: 124, y: 194 },
        { x: 76, y: 194 },
        { x: 66, y: 168 },
      ];
      k.out(body);
      k.out(armL);
      k.out(armR);
      k.out(pot);
      for (const [x, y] of [
        [92, 80],
        [108, 100],
        [94, 130],
        [106, 150],
      ])
        k.out(shapes.line({ x, y }, { x: x + 6, y: y - 5 }), { size: 2.2, wobble: 0.3 });
      if (k.colored) {
        k.paint([...body, { x: 84, y: 170 }], C.green);
        k.paint(armL, C.green, { brush: "crayon" });
        k.paint(armR, C.green, { brush: "crayon" });
        k.paint(pot, C.terracotta, { brush: "gouache" });
      }
    },
  },
  {
    id: "paper-plane",
    outline: "ink",
    colorChance: 0.7,
    draw(k) {
      const wing: Pt[] = [
        { x: 30, y: 112 },
        { x: 172, y: 50 },
        { x: 86, y: 118 },
        { x: 30, y: 112 },
      ];
      const lower: Pt[] = [
        { x: 86, y: 118 },
        { x: 172, y: 50 },
        { x: 98, y: 152 },
        { x: 86, y: 118 },
      ];
      k.out(wing);
      k.out(lower);
      for (let i = 0; i < 3; i++) {
        const x = 26 + i * 22;
        k.out(shapes.line({ x, y: 148 + i * 6 }, { x: x + 14, y: 140 + i * 6 }, -3), { size: 3 });
      }
      if (k.colored) {
        k.paint(wing, k.pick([C.sky, C.yellow, C.pink]));
        k.shade(lower, C.blue, 0.9);
      }
    },
  },
  {
    id: "heart",
    outline: "marker",
    colorChance: 0.95,
    draw(k) {
      const h = heartPath(100, 100, 4.6);
      k.out(h);
      k.out(shapes.arc(74, 82, 14, Math.PI * 1.1, Math.PI * 1.5), { size: 3.5 });
      if (k.colored) k.paint(h, k.pick([C.red, C.pink]));
    },
  },
  {
    id: "star",
    outline: "ink",
    colorChance: 0.9,
    draw(k) {
      const s = starPath(100, 104, 74, 32, 5, -Math.PI / 2 + (k.r() - 0.5) * 0.3);
      k.out(s);
      k.out(shapes.ellipse(86, 100, 3, 4, 0.3), { size: 3.5 });
      k.out(shapes.ellipse(112, 100, 3, 4, 0.3), { size: 3.5 });
      k.out(shapes.arc(99, 112, 9, Math.PI * 0.2, Math.PI * 0.8), { size: 3 });
      if (k.colored) k.paint(s, C.yellow);
    },
  },
  {
    id: "pine-forest",
    outline: "ink",
    colorChance: 1,
    draw(k) {
      const ground = shapes.curve([
        { x: 20, y: 172 },
        { x: 70, y: 164 },
        { x: 130, y: 170 },
        { x: 182, y: 162 },
      ]);
      k.stamp(shapes.line({ x: 46, y: 132 }, { x: 156, y: 128 }, 4), "pine", "#2f6b3a", 64);
      k.out(ground, { size: 3.5 });
      k.out(shapes.ellipse(150, 44, 16, 16, 0.3), { size: 3.5 });
      if (k.colored) {
        k.paint([...ground, { x: 182, y: 190 }, { x: 20, y: 190 }, { x: 20, y: 172 }], C.lime);
        k.paint(shapes.ellipse(150, 44, 14, 14, 0), C.yellow, { brush: "marker", size: 8, gap: 5 });
      }
    },
  },
  {
    id: "paper-stack",
    hero: false,
    outline: "ink",
    colorChance: 1,
    draw(k) {
      const sheets = [
        [44, 64, -0.12, C.sky],
        [56, 52, 0.05, C.yellow],
        [66, 40, 0.14, C.pink],
      ] as const;
      const polys = sheets.map(([x, y, rot, tone]) => {
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        return { tone, pts: rect(0, 0, 96, 110).map((p) => ({ x: x + p.x * c - p.y * s, y: y + p.x * s + p.y * c })) };
      });
      for (const { pts } of polys) k.out(pts);
      const top = polys[polys.length - 1].pts;
      for (let i = 0; i < 4; i++) {
        const t = 0.25 + i * 0.15;
        const a = { x: top[0].x + (top[3].x - top[0].x) * t + 12, y: top[0].y + (top[3].y - top[0].y) * t };
        const b = { x: a.x + (top[1].x - top[0].x) * 0.7, y: a.y + (top[1].y - top[0].y) * 0.7 };
        k.out(shapes.line(a, b, 2), { size: 2.5 });
      }
      if (k.colored) k.paint(top, polys[polys.length - 1].tone, { brush: "watercolor", gap: 12 });
    },
  },
  {
    id: "mini-diagram",
    hero: false,
    outline: "ink",
    colorChance: 1,
    draw(k) {
      const box = rect(22, 30, 86, 74);
      const dia: Pt[] = [
        { x: 140, y: 26 },
        { x: 176, y: 56 },
        { x: 140, y: 86 },
        { x: 104, y: 56 },
        { x: 140, y: 26 },
      ];
      const circle = shapes.ellipse(78, 150, 34, 26, 0.3);
      k.out(box);
      k.out(dia);
      k.out(circle);
      k.out(shapes.line({ x: 88, y: 52 }, { x: 102, y: 54 }, -2), { size: 3.5 });
      k.out(arrowHead({ x: 88, y: 52 }, { x: 102, y: 54 }, 9), { size: 3.5 });
      k.out(shapes.line({ x: 138, y: 90 }, { x: 112, y: 134 }, -10), { size: 3.5 });
      k.out(arrowHead({ x: 128, y: 112 }, { x: 112, y: 134 }, 10), { size: 3.5 });
      if (k.colored) {
        k.paint(box, C.yellow, { brush: "marker" });
        k.paint(dia, C.pink, { brush: "marker" });
        k.paint(circle, C.sky, { brush: "marker" });
      }
    },
  },
  {
    id: "padlock",
    hero: false,
    outline: "ink",
    colorChance: 1,
    draw(k) {
      const body = rect(56, 90, 144, 170);
      k.out(shapes.arc(100, 90, 30, Math.PI, Math.PI * 2, 38));
      k.out(body);
      k.out(shapes.ellipse(100, 122, 8, 8, 0.3), { size: 3.5 });
      k.out(shapes.line({ x: 100, y: 130 }, { x: 100, y: 148 }), { size: 3.5 });
      if (k.colored) k.paint(body, C.yellow, { brush: "gouache" });
    },
  },
  {
    id: "film-replay",
    hero: false,
    outline: "ink",
    colorChance: 1,
    draw(k) {
      k.out(rect(20, 50, 180, 150));
      for (let i = 0; i < 7; i++) {
        const x = 30 + i * 22;
        k.out(rect(x, 58, x + 10, 68), { size: 2.5, wobble: 0.4 });
        k.out(rect(x, 132, x + 10, 142), { size: 2.5, wobble: 0.4 });
      }
      const tri: Pt[] = [
        { x: 84, y: 80 },
        { x: 126, y: 100 },
        { x: 84, y: 120 },
        { x: 84, y: 80 },
      ];
      k.out(tri);
      if (k.colored) k.paint(tri, C.red, { brush: "marker" });
    },
  },
  {
    id: "share-arrow",
    hero: false,
    outline: "ink",
    colorChance: 1,
    draw(k) {
      const box = rect(26, 96, 110, 176);
      k.out(box);
      const path = shapes.curve([
        { x: 66, y: 134 },
        { x: 88, y: 76 },
        { x: 132, y: 50 },
        { x: 170, y: 46 },
      ]);
      k.out(path);
      k.out(arrowHead(path[path.length - 4], path[path.length - 1], 16));
      if (k.colored) k.paint(box, C.sky, { brush: "watercolor" });
    },
  },
  {
    id: "brush-jar",
    hero: false,
    outline: "ink",
    colorChance: 1,
    draw(k) {
      const jar = shapes.curve([
        { x: 58, y: 100 },
        { x: 54, y: 150 },
        { x: 66, y: 186 },
        { x: 134, y: 186 },
        { x: 146, y: 150 },
        { x: 142, y: 100 },
      ]);
      const tips: [Pt, Pt, string][] = [
        [{ x: 84, y: 110 }, { x: 64, y: 30 }, C.red],
        [{ x: 100, y: 110 }, { x: 104, y: 20 }, C.blue],
        [{ x: 116, y: 110 }, { x: 146, y: 36 }, C.yellow],
      ];
      for (const [a, b] of tips) k.out(shapes.line(a, b, 2), { size: 4 });
      k.out(jar);
      k.out(shapes.ellipse(100, 100, 42, 8, 0.2), { size: 3.5 });
      if (k.colored) {
        for (const [, b, tone] of tips) k.paint(shapes.ellipse(b.x, b.y + 6, 7, 12, 0), tone, { brush: "marker", size: 7, gap: 4 });
        k.paint([...jar, { x: 58, y: 100 }], C.sky, { brush: "watercolor" });
      }
    },
  },
];

function chunk(path: Pt[], max: number): Pt[][] {
  if (path.length < 2) return [];
  const out: Pt[][] = [];
  let cur: Pt[] = [path[0]];
  let run = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (run + len > max && cur.length > 1 && len < max) {
      out.push(cur);
      cur = [a];
      run = 0;
    }
    if (len >= max) {
      const steps = Math.ceil(len / max);
      for (let k = 1; k <= steps; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps };
        cur.push(p);
        if (k < steps) {
          out.push(cur);
          cur = [p];
        }
      }
      run = len / steps;
      continue;
    }
    cur.push(b);
    run += len;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function build(spec: Spec, seed: number, mode: DoodleMode): Doodle {
  const w = spec.w ?? 200;
  const h = spec.h ?? 200;
  const pen = new Pen(seed * 7919 + spec.id.length * 131, spec.id);
  const r = () => pen.random();
  const colored = mode === "watercolor" || r() < (spec.colorChance ?? 0.8);
  const strokes: StrokeLike[] = [];
  const fills = spec.fills ?? (["watercolor", "gouache", "crayon", "marker"] as const);
  const outline = OUTLINE_STYLE[spec.outline];
  const ink = spec.ink ?? INK;
  const kit: Kit = {
    r,
    pick: (xs) => xs[Math.floor(r() * xs.length) % xs.length],
    colored,
    out(path, o) {
      strokes.push(pen.stroke(path, { ...outline, color: ink, ...o }, "o"));
    },
    paint(poly, color, o) {
      const brush: FillBrush = mode === "watercolor" ? "watercolor" : (o?.brush ?? kit.pick(fills));
      const st = FILL_STYLE[brush];
      const size = mode === "watercolor" ? st.size : (o?.size ?? st.size);
      const gap = mode === "watercolor" ? st.gap : (o?.gap ?? st.gap);
      const path = fill.scrub(poly, gap, o?.angle ?? -0.5 + (r() - 0.5) * 0.4);
      for (const piece of chunk(path, 260)) {
        strokes.push(pen.stroke(piece, { brush, color, size, opacity: st.opacity, speed: st.speed, wobble: 0.6 }, "f"));
      }
    },
    shade(poly, color, angle = 0.8) {
      const brush: FillBrush = mode === "watercolor" ? "watercolor" : "crayon";
      for (const line of fill.hatch(poly, angle, 7)) {
        strokes.push(pen.stroke(line, { brush, color, size: mode === "watercolor" ? 12 : 4, opacity: 0.55, speed: 1.2, wobble: 0.3 }, "f"));
      }
    },
    stamp(path, brush, color, size) {
      strokes.push(pen.stroke(path, { brush, color, size, wobble: 0.5, speed: 0.5 }, "o"));
    },
  };
  pen.rest(80);
  spec.draw(kit);
  for (const s of strokes) {
    for (const p of s.points) {
      p.x = Math.min(w + 3, Math.max(-3, p.x));
      p.y = Math.min(h + 3, Math.max(-3, p.y));
    }
  }
  const last = strokes[strokes.length - 1];
  return { id: spec.id, w, h, strokes, duration: last ? last.startTime! + last.duration! : 0 };
}

export const DOODLES: DoodleDef[] = SPECS.map((spec) => ({
  id: spec.id,
  hero: spec.hero !== false,
  make: (seed: number, mode: DoodleMode = "normal") => build(spec, seed, mode),
}));

const PENCIL = new Set(SPECS.filter((s) => s.outline === "pencil").map((s) => s.id));

export function usesPencil(id: string): boolean {
  return PENCIL.has(id);
}

export function doodleById(id: string): DoodleDef | undefined {
  return DOODLES.find((d) => d.id === id);
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickDoodles(n: number, rand: () => number, exclude: Set<string>): DoodleDef[] {
  const pool = shuffle(
    DOODLES.filter((d) => d.hero && !exclude.has(d.id)),
    rand,
  );
  const lead = pool.filter((d) => !PENCIL.has(d.id)).slice(0, 2);
  const rest = pool.filter((d) => !lead.includes(d));
  return [...lead, ...rest].slice(0, n);
}

export function strokeRole(s: StrokeLike): "outline" | "fill" {
  return /-f\d+$/.test(s.id) ? "fill" : "outline";
}

const AUTOGRAPH_SIZE: Partial<Record<BrushStyle, number>> = {
  ink: 4,
  pencil: 3.5,
  marker: 5,
  crayon: 7,
  gouache: 9,
  watercolor: 14,
  charcoal: 8,
  pine: 26,
};

export function autograph(name: string, brush: BrushStyle, color: string, seed: number): Doodle {
  const pen = new Pen(seed, `sig-${brush}`);
  const r = () => pen.random();
  const n = Math.max(3, Math.min(9, name.length));
  const w = 40 + n * 24;
  const h = 100;
  const heights = Array.from({ length: n }, (_, i) => (i === 0 ? 1.5 : 0.55 + r() * 0.8));
  const path: Pt[] = [];
  for (let i = 0; i <= n * 16; i++) {
    const u = i / 16;
    const lift = heights[Math.min(n - 1, Math.floor(u))];
    const y = 66 - 30 * lift * Math.abs(Math.sin(Math.PI * u)) + 5 * Math.cos(2 * Math.PI * u);
    path.push({ x: 20 + u * 24 - 9 * Math.sin(2 * Math.PI * u) + (66 - y) * 0.3, y });
  }
  const size = AUTOGRAPH_SIZE[brush] ?? 6;
  const style: PenStyle = { brush, color, size, wobble: 0.8, speed: 0.9, taper: brush === "ink" ? [10, 24] : [0, 0] };
  pen.rest(40);
  const strokes = [
    pen.stroke(path, style),
    pen.stroke(shapes.line({ x: 14, y: 86 }, { x: w - 12, y: 80 }, -6), { ...style, speed: 1.2 }),
  ];
  for (const s of strokes)
    for (const p of s.points) {
      p.x = Math.min(w + 3, Math.max(-3, p.x));
      p.y = Math.min(h + 3, Math.max(-3, p.y));
    }
  const last = strokes[strokes.length - 1];
  return { id: `sig-${brush}`, w, h, strokes, duration: last.startTime! + last.duration! };
}
