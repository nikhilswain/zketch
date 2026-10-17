export type TrackKind =
  | "size"
  | "opacity"
  | "stabilizer"
  | "variation"
  | "taper"
  | "flat";

export const TRACK_W = 520;
export const TRACK_H = 48;
export const TRACK_PAD = 4;

const SAMPLES = 80;
const C = TRACK_H / 2;

function samples() {
  const out: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    out.push(TRACK_PAD + (i * (TRACK_W - 2 * TRACK_PAD)) / SAMPLES);
  }
  return out;
}

function progress(x: number) {
  return (x - TRACK_PAD) / (TRACK_W - 2 * TRACK_PAD);
}

function band(halfWidth: (t: number) => number) {
  const xs = samples();
  const top = xs.map((x) => `${x.toFixed(1)} ${(C - halfWidth(progress(x))).toFixed(1)}`);
  const bottom = xs
    .map((x) => `${x.toFixed(1)} ${(C + halfWidth(progress(x))).toFixed(1)}`)
    .reverse();
  return `M${top.join(" L")} L${bottom.join(" L")} Z`;
}

function wobble() {
  return (
    "M" +
    samples()
      .map((x) => {
        const t = progress(x);
        const a = 9 * Math.pow(1 - t, 2.2);
        const y = C + a * Math.sin(t * 60) + 0.4 * a * Math.sin(t * 137);
        return `${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" L")
  );
}

const cache = new Map<TrackKind, { d: string; mode: "fill" | "stroke" }>();

export function trackPath(kind: TrackKind): { d: string; mode: "fill" | "stroke" } {
  const hit = cache.get(kind);
  if (hit) return hit;
  let shape: { d: string; mode: "fill" | "stroke" };
  switch (kind) {
    case "size":
      shape = { d: band((t) => 0.6 + 9.4 * t), mode: "fill" };
      break;
    case "variation":
      shape = {
        d: band((t) => 1.2 + (1.5 + 5.5 * t) * Math.abs(Math.sin(t * Math.PI * 5))),
        mode: "fill",
      };
      break;
    case "taper":
      shape = {
        d: band((t) => 0.4 + 8 * Math.pow(Math.sin(Math.PI * t), 0.7)),
        mode: "fill",
      };
      break;
    case "stabilizer":
      shape = { d: wobble(), mode: "stroke" };
      break;
    default:
      shape = { d: band(() => 3), mode: "fill" };
  }
  cache.set(kind, shape);
  return shape;
}
