export class SvgUnsupported extends Error {}

type Matrix = [number, number, number, number, number, number];
type Pt = { x: number; y: number };

interface State {
  m: Matrix;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  globalAlpha: number;
  comp: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  dash: number[];
  dashOffset: number;
  clip: string | null;
}

const TAU = Math.PI * 2;
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

const m4 = (m: Matrix) => m.map((v) => String(Math.round(v * 1e4) / 1e4)).join(" ");

export const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

const apply = (m: Matrix, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

const BASELINES: Partial<Record<CanvasTextBaseline, string>> = {
  top: "text-before-edge",
  hanging: "hanging",
  middle: "central",
  bottom: "text-after-edge",
  ideographic: "ideographic",
};

const ANCHORS: Record<CanvasTextAlign, string> = {
  left: "start",
  start: "start",
  center: "middle",
  right: "end",
  end: "end",
};

let measureCtx: CanvasRenderingContext2D | null = null;

export class SvgContext {
  private parts: string[] = [];
  readonly defs: string[] = [];
  private stack: State[] = [];
  private s: State = {
    m: IDENTITY,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 10,
    globalAlpha: 1,
    comp: "source-over",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    dash: [],
    dashOffset: 0,
    clip: null,
  };
  private d: string[] = [];
  private cur: Pt | null = null;
  private start: Pt | null = null;

  constructor(private nextId: () => string) {}

  body(): string {
    return this.parts.join("");
  }

  get canvas(): HTMLCanvasElement {
    throw new SvgUnsupported("canvas");
  }

  save() {
    this.stack.push({ ...this.s, dash: [...this.s.dash] });
  }

  restore() {
    const prev = this.stack.pop();
    if (prev) this.s = prev;
  }

  get fillStyle() {
    return this.s.fillStyle;
  }
  set fillStyle(v: string | CanvasGradient | CanvasPattern) {
    if (typeof v !== "string") throw new SvgUnsupported("fillStyle");
    this.s.fillStyle = v;
  }
  get strokeStyle() {
    return this.s.strokeStyle;
  }
  set strokeStyle(v: string | CanvasGradient | CanvasPattern) {
    if (typeof v !== "string") throw new SvgUnsupported("strokeStyle");
    this.s.strokeStyle = v;
  }
  get lineWidth() {
    return this.s.lineWidth;
  }
  set lineWidth(v: number) {
    this.s.lineWidth = v;
  }
  get lineCap() {
    return this.s.lineCap;
  }
  set lineCap(v: CanvasLineCap) {
    this.s.lineCap = v;
  }
  get lineJoin() {
    return this.s.lineJoin;
  }
  set lineJoin(v: CanvasLineJoin) {
    this.s.lineJoin = v;
  }
  get miterLimit() {
    return this.s.miterLimit;
  }
  set miterLimit(v: number) {
    this.s.miterLimit = v;
  }
  get globalAlpha() {
    return this.s.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.s.globalAlpha = v;
  }
  get globalCompositeOperation() {
    return this.s.comp as GlobalCompositeOperation;
  }
  set globalCompositeOperation(v: GlobalCompositeOperation) {
    if (v !== "source-over" && v !== "multiply") throw new SvgUnsupported(v);
    this.s.comp = v;
  }
  get font() {
    return this.s.font;
  }
  set font(v: string) {
    this.s.font = v;
  }
  get textAlign() {
    return this.s.textAlign;
  }
  set textAlign(v: CanvasTextAlign) {
    this.s.textAlign = v;
  }
  get textBaseline() {
    return this.s.textBaseline;
  }
  set textBaseline(v: CanvasTextBaseline) {
    this.s.textBaseline = v;
  }
  get lineDashOffset() {
    return this.s.dashOffset;
  }
  set lineDashOffset(v: number) {
    this.s.dashOffset = v;
  }
  get filter() {
    return "none";
  }
  set filter(v: string) {
    if (v && v !== "none") throw new SvgUnsupported("filter");
  }
  get shadowBlur() {
    return 0;
  }
  set shadowBlur(v: number) {
    if (v > 0) throw new SvgUnsupported("shadow");
  }
  get shadowColor() {
    return "rgba(0, 0, 0, 0)";
  }
  set shadowColor(_v: string) {}
  get imageSmoothingEnabled() {
    return true;
  }
  set imageSmoothingEnabled(_v: boolean) {}
  get imageSmoothingQuality(): ImageSmoothingQuality {
    return "high";
  }
  set imageSmoothingQuality(_v: ImageSmoothingQuality) {}

  setLineDash(segments: number[]) {
    this.s.dash = [...segments];
  }

  getLineDash() {
    return [...this.s.dash];
  }

  translate(x: number, y: number) {
    this.s.m = multiply(this.s.m, [1, 0, 0, 1, x, y]);
  }

  scale(x: number, y: number) {
    this.s.m = multiply(this.s.m, [x, 0, 0, y, 0, 0]);
  }

  rotate(a: number) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.s.m = multiply(this.s.m, [c, s, -s, c, 0, 0]);
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.s.m = multiply(this.s.m, [a, b, c, d, e, f]);
  }

  setTransform(a?: number | DOMMatrix2DInit, b?: number, c?: number, d?: number, e?: number, f?: number) {
    if (typeof a === "object") {
      this.s.m = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
    } else if (a === undefined) {
      this.s.m = IDENTITY;
    } else {
      this.s.m = [a, b!, c!, d!, e!, f!];
    }
  }

  resetTransform() {
    this.s.m = IDENTITY;
  }

  getTransform(): DOMMatrix {
    const [a, b, c, d, e, f] = this.s.m;
    return new DOMMatrix([a, b, c, d, e, f]);
  }

  beginPath() {
    this.d = [];
    this.cur = null;
    this.start = null;
  }

  private dev(x: number, y: number) {
    return apply(this.s.m, x, y);
  }

  private user(p: Pt): Pt {
    return apply(invert(this.s.m), p.x, p.y);
  }

  moveTo(x: number, y: number) {
    const p = this.dev(x, y);
    this.d.push(`M${n(p.x)} ${n(p.y)}`);
    this.cur = p;
    this.start = p;
  }

  lineTo(x: number, y: number) {
    if (!this.cur) return this.moveTo(x, y);
    const p = this.dev(x, y);
    this.d.push(`L${n(p.x)} ${n(p.y)}`);
    this.cur = p;
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    if (!this.cur) this.moveTo(cpx, cpy);
    const c = this.dev(cpx, cpy);
    const p = this.dev(x, y);
    this.d.push(`Q${n(c.x)} ${n(c.y)} ${n(p.x)} ${n(p.y)}`);
    this.cur = p;
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    if (!this.cur) this.moveTo(c1x, c1y);
    const a = this.dev(c1x, c1y);
    const b = this.dev(c2x, c2y);
    const p = this.dev(x, y);
    this.d.push(`C${n(a.x)} ${n(a.y)} ${n(b.x)} ${n(b.y)} ${n(p.x)} ${n(p.y)}`);
    this.cur = p;
  }

  closePath() {
    if (!this.cur) return;
    this.d.push("Z");
    this.cur = this.start;
  }

  rect(x: number, y: number, w: number, h: number) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
    this.moveTo(x, y);
  }

  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }

  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false) {
    let sweep = a1 - a0;
    if (!ccw) sweep = sweep >= TAU ? TAU : ((sweep % TAU) + TAU) % TAU;
    else sweep = -sweep >= TAU ? -TAU : -((((a0 - a1) % TAU) + TAU) % TAU);
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const at = (t: number) => ({ x: x + cr * rx * Math.cos(t) - sr * ry * Math.sin(t), y: y + sr * rx * Math.cos(t) + cr * ry * Math.sin(t) });
    const tan = (t: number) => ({ x: -cr * rx * Math.sin(t) - sr * ry * Math.cos(t), y: -sr * rx * Math.sin(t) + cr * ry * Math.cos(t) });
    const p0 = at(a0);
    if (this.cur) this.lineTo(p0.x, p0.y);
    else this.moveTo(p0.x, p0.y);
    if (sweep === 0) return;
    const segs = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
    const step = sweep / segs;
    const k = (4 / 3) * Math.tan(step / 4);
    for (let i = 0; i < segs; i++) {
      const t0 = a0 + step * i;
      const t1 = t0 + step;
      const s = at(t0);
      const e = at(t1);
      const d0 = tan(t0);
      const d1 = tan(t1);
      this.bezierCurveTo(s.x + k * d0.x, s.y + k * d0.y, e.x - k * d1.x, e.y - k * d1.y, e.x, e.y);
    }
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    if (!this.cur) return this.moveTo(x1, y1);
    const p0 = this.user(this.cur);
    const v1 = { x: p0.x - x1, y: p0.y - y1 };
    const v2 = { x: x2 - x1, y: y2 - y1 };
    const l1 = Math.hypot(v1.x, v1.y);
    const l2 = Math.hypot(v2.x, v2.y);
    const cross = v1.x * v2.y - v1.y * v2.x;
    if (r === 0 || l1 < 1e-9 || l2 < 1e-9 || Math.abs(cross) < 1e-9) return this.lineTo(x1, y1);
    const u1 = { x: v1.x / l1, y: v1.y / l1 };
    const u2 = { x: v2.x / l2, y: v2.y / l2 };
    const angle = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
    const dist = r / Math.tan(angle / 2);
    const t1 = { x: x1 + u1.x * dist, y: y1 + u1.y * dist };
    const t2 = { x: x1 + u2.x * dist, y: y1 + u2.y * dist };
    const bis = { x: u1.x + u2.x, y: u1.y + u2.y };
    const bl = Math.hypot(bis.x, bis.y);
    const off = r / Math.sin(angle / 2);
    const c = { x: x1 + (bis.x / bl) * off, y: y1 + (bis.y / bl) * off };
    const a0 = Math.atan2(t1.y - c.y, t1.x - c.x);
    const a1 = Math.atan2(t2.y - c.y, t2.x - c.x);
    let sweep = a1 - a0;
    if (sweep > Math.PI) sweep -= TAU;
    if (sweep < -Math.PI) sweep += TAU;
    this.lineTo(t1.x, t1.y);
    this.ellipse(c.x, c.y, r, r, 0, a0, a0 + sweep, sweep < 0);
  }

  roundRect(x: number, y: number, w: number, h: number, radii: number | number[] = 0) {
    const r = Math.min(Array.isArray(radii) ? (radii[0] ?? 0) : radii, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  }

  private scaleFactor() {
    const [a, b, c, d] = this.s.m;
    return Math.sqrt(Math.abs(a * d - b * c));
  }

  private common(): string {
    let out = "";
    if (this.s.globalAlpha < 1) out += ` opacity="${Math.round(this.s.globalAlpha * 1000) / 1000}"`;
    if (this.s.comp === "multiply") out += ` style="mix-blend-mode:multiply"`;
    if (this.s.clip) out += ` clip-path="url(#${this.s.clip})"`;
    return out;
  }

  private pathData() {
    return this.d.join("");
  }

  fill(a?: Path2D | CanvasFillRule, b?: CanvasFillRule) {
    if (a !== undefined && typeof a !== "string") throw new SvgUnsupported("Path2D");
    const rule = (typeof a === "string" ? a : b) === "evenodd" ? ` fill-rule="evenodd"` : "";
    const d = this.pathData();
    if (!d) return;
    this.parts.push(`<path d="${d}" fill="${escapeXml(this.s.fillStyle)}"${rule}${this.common()}/>`);
  }

  stroke(path?: Path2D) {
    if (path !== undefined) throw new SvgUnsupported("Path2D");
    const d = this.pathData();
    if (!d) return;
    const k = this.scaleFactor();
    let attrs = ` stroke-width="${n(this.s.lineWidth * k)}" stroke-linecap="${this.s.lineCap}" stroke-linejoin="${this.s.lineJoin}"`;
    if (this.s.lineJoin === "miter") attrs += ` stroke-miterlimit="${n(this.s.miterLimit)}"`;
    if (this.s.dash.length) {
      attrs += ` stroke-dasharray="${this.s.dash.map((v) => n(v * k)).join(" ")}"`;
      if (this.s.dashOffset) attrs += ` stroke-dashoffset="${n(this.s.dashOffset * k)}"`;
    }
    this.parts.push(`<path d="${d}" fill="none" stroke="${escapeXml(this.s.strokeStyle)}"${attrs}${this.common()}/>`);
  }

  fillPathData(d: string, rule: CanvasFillRule = "nonzero") {
    const transform = this.s.m === IDENTITY ? "" : ` transform="matrix(${m4(this.s.m)})"`;
    const fr = rule === "evenodd" ? ` fill-rule="evenodd"` : "";
    this.parts.push(`<path d="${escapeXml(d)}" fill="${escapeXml(this.s.fillStyle)}"${fr}${transform}${this.common()}/>`);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const saved = { d: this.d, cur: this.cur, start: this.start };
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    this.d = saved.d;
    this.cur = saved.cur;
    this.start = saved.start;
  }

  strokeRect(x: number, y: number, w: number, h: number) {
    const saved = { d: this.d, cur: this.cur, start: this.start };
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    this.d = saved.d;
    this.cur = saved.cur;
    this.start = saved.start;
  }

  clip(a?: Path2D | CanvasFillRule, b?: CanvasFillRule) {
    if (a !== undefined && typeof a !== "string") throw new SvgUnsupported("Path2D");
    const rule = (typeof a === "string" ? a : b) === "evenodd" ? "evenodd" : "nonzero";
    const id = this.nextId();
    const parent = this.s.clip ? ` clip-path="url(#${this.s.clip})"` : "";
    this.defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"${parent}><path d="${this.pathData()}" clip-rule="${rule}"/></clipPath>`);
    this.s.clip = id;
  }

  fillText(text: string, x: number, y: number) {
    if (!text) return;
    const baseline = BASELINES[this.s.textBaseline];
    const attrs =
      ` x="${n(x)}" y="${n(y)}" transform="matrix(${m4(this.s.m)})"` +
      ` text-anchor="${ANCHORS[this.s.textAlign]}"` +
      (baseline ? ` dominant-baseline="${baseline}"` : "") +
      ` fill="${escapeXml(this.s.fillStyle)}"`;
    this.parts.push(
      `<text${attrs} style="font:${escapeXml(this.s.font)};white-space:pre"${this.common()}>${escapeXml(text)}</text>`,
    );
  }

  measureText(text: string): TextMetrics {
    measureCtx ??= document.createElement("canvas").getContext("2d")!;
    measureCtx.font = this.s.font;
    return measureCtx.measureText(text);
  }

  isPointInPath(): boolean {
    return false;
  }

  drawImage(): void {
    throw new SvgUnsupported("drawImage");
  }

  getImageData(): ImageData {
    throw new SvgUnsupported("getImageData");
  }

  putImageData(): void {
    throw new SvgUnsupported("putImageData");
  }

  clearRect(): void {
    throw new SvgUnsupported("clearRect");
  }

  createPattern(): CanvasPattern | null {
    throw new SvgUnsupported("pattern");
  }

  createLinearGradient(): CanvasGradient {
    throw new SvgUnsupported("gradient");
  }

  createRadialGradient(): CanvasGradient {
    throw new SvgUnsupported("gradient");
  }
}

export function isSvgContext(ctx: unknown): ctx is SvgContext {
  return ctx instanceof SvgContext;
}
