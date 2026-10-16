import { StampBrush } from "../stamp/StampBrush";

const RAV = "rav89-digital-painting";
const tip = (name: string) => `${RAV}/${name}`;
const frames = (name: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${RAV}/${name}-${i}`);
const ROUGH_PAPER = tip("rough-paper");
const SKIN = tip("skin");
const WATERCOLOR_PAPER = tip("watercolor-paper");
const GRUNGE = tip("grunge");

export const oilBrush = new StampBrush({
  key: "oil",
  label: "Oil Paint",
  category: "paint",
  tips: [tip("paint-blot")],
  keepAspect: true,
  spacing: 0.08,
  flow: 0.75,
  flowPressure: 0.45,
  sizePressure: 0.4,
  flowJitter: 0.35,
  sizeJitter: 0.1,
  angleMode: "random",
  grain: { id: SKIN, scale: 0.6, depth: 0.45 },
  presets: [
    { id: "round", label: "Round", size: 40, opacity: 1 },
    { id: "detail", label: "Detail", size: 14, opacity: 1 },
    { id: "block", label: "Block-in", size: 90, opacity: 0.9 },
  ],
});

export const rakeBrush = new StampBrush({
  key: "rake",
  label: "Bristle Rake",
  category: "paint",
  tips: [tip("rake")],
  keepAspect: true,
  spacing: 0.03,
  flow: 0.95,
  flowPressure: 0.5,
  sizePressure: 0.3,
  angleMode: "direction",
  followCurve: true,
  presets: [
    { id: "rake", label: "Rake", size: 40, opacity: 1 },
    { id: "hair", label: "Hair", size: 22, opacity: 0.85 },
    { id: "wide", label: "Wide", size: 80, opacity: 0.8 },
  ],
});

export const smearBrush = new StampBrush({
  key: "smear",
  label: "Rough Smear",
  category: "paint",
  tips: [tip("smear")],
  keepAspect: true,
  spacing: 0.06,
  flow: 0.4,
  flowPressure: 0.5,
  sizePressure: 0.3,
  flowJitter: 0.2,
  angleMode: "direction",
  followCurve: true,
  grain: { id: SKIN, scale: 0.8, depth: 0.5 },
  presets: [
    { id: "smear", label: "Smear", size: 70, opacity: 0.9 },
    { id: "scumble", label: "Scumble", size: 120, opacity: 0.6 },
    { id: "small", label: "Small", size: 30, opacity: 1 },
  ],
});

export const flatBristleBrush = new StampBrush({
  key: "flatbristle",
  label: "Flat Bristle",
  category: "paint",
  tips: [tip("flat-bristle")],
  keepAspect: true,
  spacing: 0.05,
  flow: 0.4,
  flowPressure: 0.45,
  flowJitter: 0.4,
  sizePressure: 0.3,
  angleMode: "direction",
  followCurve: true,
  angleJitter: 0.08,
  grain: { id: ROUGH_PAPER, scale: 0.7, depth: 0.75 },
  presets: [
    { id: "flat", label: "Flat", size: 50, opacity: 1 },
    { id: "thin", label: "Thin Paint", size: 70, opacity: 0.6 },
    { id: "detail", label: "Detail", size: 20, opacity: 1 },
  ],
});

export const knifeBrush = new StampBrush({
  key: "knife",
  label: "Palette Knife",
  category: "paint",
  tips: [tip("knife")],
  keepAspect: true,
  spacing: 0.06,
  flow: 0.6,
  flowPressure: 0.4,
  flowJitter: 0.25,
  sizePressure: 0.25,
  angleMode: "direction",
  followCurve: true,
  angleJitter: 0.15,
  presets: [
    { id: "knife", label: "Knife", size: 60, opacity: 1 },
    { id: "impasto", label: "Impasto", size: 100, opacity: 1 },
    { id: "edge", label: "Edge", size: 30, opacity: 0.9 },
  ],
});

export const softFlatBrush = new StampBrush({
  key: "softflat",
  label: "Soft Flat",
  category: "paint",
  tips: [tip("soft-flat")],
  keepAspect: true,
  spacing: 0.07,
  flow: 0.25,
  flowPressure: 0.6,
  flowJitter: 0.12,
  sizePressure: 0.2,
  angleMode: "direction",
  followCurve: true,
  grain: { id: WATERCOLOR_PAPER, scale: 1, depth: 0.45 },
  presets: [
    { id: "blend", label: "Blend", size: 70, opacity: 0.8 },
    { id: "glaze", label: "Glaze", size: 120, opacity: 0.45 },
    { id: "soft", label: "Soft Edge", size: 40, opacity: 1 },
  ],
});

export const wetFlatBrush = new StampBrush({
  key: "wetflat",
  label: "Wet Flat",
  category: "paint",
  tips: [tip("wet-flat")],
  keepAspect: true,
  spacing: 0.04,
  flow: 0.55,
  flowPressure: 0.5,
  sizePressure: 0.25,
  angleMode: "direction",
  followCurve: true,
  directionOffset: Math.PI / 2,
  presets: [
    { id: "wet", label: "Wet", size: 60, opacity: 0.85 },
    { id: "broad", label: "Broad", size: 110, opacity: 0.65 },
    { id: "small", label: "Small", size: 28, opacity: 1 },
  ],
});

export const dabsBrush = new StampBrush({
  key: "dabs",
  label: "Impressionist",
  category: "texture",
  tips: [tip("dabs")],
  keepAspect: true,
  spacing: 0.2,
  flow: 0.85,
  flowJitter: 0.2,
  sizePressure: 0.3,
  scatter: 0.3,
  angleMode: "random",
  presets: [
    { id: "dabs", label: "Dabs", size: 60, opacity: 1 },
    { id: "fine", label: "Fine", size: 30, opacity: 0.9 },
    { id: "big", label: "Broad", size: 120, opacity: 0.8 },
  ],
});

export const streaksBrush = new StampBrush({
  key: "streaks",
  label: "Streaks",
  category: "texture",
  tips: [tip("streaks")],
  keepAspect: true,
  spacing: 0.25,
  flow: 0.85,
  flowJitter: 0.25,
  sizeJitter: 0.2,
  scatter: 0.25,
  scatterBothAxes: true,
  angleMode: "direction",
  followCurve: true,
  angleJitter: 0.25,
  presets: [
    { id: "streaks", label: "Streaks", size: 45, opacity: 1 },
    { id: "fine", label: "Fine", size: 24, opacity: 0.9 },
    { id: "rain", label: "Broad", size: 90, opacity: 0.8 },
  ],
});

export const scratchBrush = new StampBrush({
  key: "scratch",
  label: "Scratchy",
  category: "texture",
  tips: [tip("scratch")],
  keepAspect: true,
  spacing: 0.25,
  flow: 0.8,
  flowJitter: 0.3,
  sizePressure: 0.2,
  angleMode: "random",
  presets: [
    { id: "scratch", label: "Scratch", size: 90, opacity: 0.9 },
    { id: "wear", label: "Wear", size: 160, opacity: 0.6 },
    { id: "fine", label: "Fine", size: 50, opacity: 1 },
  ],
});

export const crayonBrush = new StampBrush({
  key: "crayon",
  label: "Wax Crayon",
  category: "draw",
  tips: [tip("crayon")],
  keepAspect: true,
  spacing: 0.08,
  flow: 0.7,
  flowPressure: 0.4,
  flowJitter: 0.3,
  sizePressure: 0.2,
  angleMode: "direction",
  followCurve: true,
  angleJitter: 0.2,
  grain: { id: ROUGH_PAPER, scale: 0.5, depth: 0.7 },
  presets: [
    { id: "crayon", label: "Crayon", size: 40, opacity: 1 },
    { id: "bold", label: "Bold", size: 70, opacity: 1 },
    { id: "light", label: "Light", size: 30, opacity: 0.6 },
  ],
});

export const cloudsBrush = new StampBrush({
  key: "clouds",
  label: "Clouds",
  category: "nature",
  maxSize: 400,
  tips: frames("cloud", 3),
  keepAspect: true,
  spacing: 0.25,
  flow: 0.35,
  flowJitter: 0.35,
  sizeJitter: 0.3,
  scatter: 0.2,
  angleMode: "random",
  angleJitter: 0.2,
  flip: true,
  presets: [
    { id: "cumulus", label: "Cumulus", size: 140, opacity: 0.9 },
    { id: "haze", label: "Haze", size: 260, opacity: 0.5 },
    { id: "smoke", label: "Smoke", size: 80, opacity: 0.7 },
  ],
});

export const dustBrush = new StampBrush({
  key: "dust",
  label: "Dust",
  category: "texture",
  maxSize: 400,
  tips: frames("dust", 3),
  keepAspect: true,
  spacing: 0.12,
  flow: 0.9,
  sizeJitter: 0.6,
  scatter: 0.6,
  scatterBothAxes: true,
  angleMode: "random",
  presets: [
    { id: "dust", label: "Dust", size: 120, opacity: 0.9 },
    { id: "specks", label: "Specks", size: 60, opacity: 1 },
    { id: "snow", label: "Snow", size: 220, opacity: 0.9 },
  ],
});

export const sparkleBrush = new StampBrush({
  key: "sparkle",
  label: "Sparkle",
  category: "effects",
  tips: [tip("star")],
  keepAspect: true,
  spacing: 0.9,
  flow: 1,
  sizeJitter: 0.8,
  sizePressure: 0.3,
  scatter: 1.2,
  scatterBothAxes: true,
  angleMode: "random",
  angleJitter: 0.3,
  presets: [
    { id: "sparkle", label: "Sparkle", size: 50, opacity: 1 },
    { id: "glow", label: "Big Glow", size: 100, opacity: 0.9 },
    { id: "glitter", label: "Glitter", size: 24, opacity: 1 },
  ],
});

export const starsBrush = new StampBrush({
  key: "stars",
  label: "Starfield",
  category: "effects",
  maxSize: 400,
  tips: [tip("stars")],
  keepAspect: true,
  spacing: 0.4,
  flow: 1,
  sizeJitter: 0.3,
  scatter: 0.4,
  scatterBothAxes: true,
  angleMode: "random",
  flip: true,
  presets: [
    { id: "stars", label: "Stars", size: 200, opacity: 1 },
    { id: "dense", label: "Dense", size: 120, opacity: 1 },
    { id: "faint", label: "Faint", size: 300, opacity: 0.6 },
  ],
});

export const glintBrush = new StampBrush({
  key: "glint",
  label: "Water Glints",
  category: "effects",
  tips: frames("glint", 2),
  keepAspect: true,
  spacing: 0.35,
  flow: 0.85,
  flowJitter: 0.3,
  sizeJitter: 0.4,
  scatter: 0.35,
  scatterBothAxes: true,
  angleMode: "fixed",
  angleJitter: 0.04,
  flip: true,
  presets: [
    { id: "glints", label: "Glints", size: 70, opacity: 1 },
    { id: "ripples", label: "Ripples", size: 120, opacity: 0.8 },
    { id: "tiny", label: "Tiny", size: 36, opacity: 1 },
  ],
});

export const foliageBrush = new StampBrush({
  key: "foliage",
  label: "Foliage",
  category: "nature",
  maxSize: 400,
  tips: frames("foliage", 3),
  keepAspect: true,
  spacing: 0.3,
  flow: 1,
  sizeJitter: 0.3,
  sizePressure: 0.3,
  scatter: 0.2,
  angleMode: "random",
  angleJitter: 0.2,
  flip: true,
  presets: [
    { id: "foliage", label: "Foliage", size: 120, opacity: 1 },
    { id: "canopy", label: "Canopy", size: 220, opacity: 1 },
    { id: "sprigs", label: "Sprigs", size: 60, opacity: 1 },
  ],
});

export const leavesBrush = new StampBrush({
  key: "leaves",
  label: "Leaves",
  category: "nature",
  maxSize: 400,
  tips: frames("leaves", 2),
  keepAspect: true,
  spacing: 0.5,
  flow: 1,
  sizeJitter: 0.35,
  sizePressure: 0.3,
  scatter: 0.25,
  angleMode: "random",
  flip: true,
  presets: [
    { id: "leaves", label: "Leaves", size: 100, opacity: 1 },
    { id: "plants", label: "Plants", size: 180, opacity: 1 },
    { id: "small", label: "Small", size: 50, opacity: 1 },
  ],
});

export const grassBrush = new StampBrush({
  key: "grass",
  label: "Grass",
  category: "nature",
  maxSize: 400,
  tips: [tip("grass")],
  keepAspect: true,
  spacing: 0.3,
  flow: 1,
  sizeJitter: 0.25,
  sizePressure: 0.3,
  angleMode: "fixed",
  angleJitter: 0.06,
  flip: true,
  presets: [
    { id: "grass", label: "Grass", size: 140, opacity: 1 },
    { id: "meadow", label: "Meadow", size: 240, opacity: 1 },
    { id: "tufts", label: "Tufts", size: 70, opacity: 1 },
  ],
});

export const forestBrush = new StampBrush({
  key: "forest",
  label: "Forest",
  category: "nature",
  maxSize: 400,
  tips: [tip("forest")],
  keepAspect: true,
  spacing: 0.3,
  flow: 1,
  sizeJitter: 0.35,
  sizePressure: 0.3,
  angleMode: "fixed",
  flip: true,
  presets: [
    { id: "forest", label: "Forest", size: 160, opacity: 1 },
    { id: "far", label: "Far Hills", size: 90, opacity: 0.6 },
    { id: "near", label: "Near", size: 300, opacity: 1 },
  ],
});

export const bushBrush = new StampBrush({
  key: "bush",
  label: "Bush",
  category: "nature",
  maxSize: 400,
  tips: [tip("bush")],
  keepAspect: true,
  spacing: 0.25,
  flow: 1,
  count: 2,
  sizeJitter: 0.4,
  sizePressure: 0.3,
  scatter: 0.4,
  scatterBothAxes: true,
  angleMode: "random",
  angleJitter: 0.3,
  flip: true,
  grain: { id: GRUNGE, scale: 0.5, depth: 0.4 },
  presets: [
    { id: "bush", label: "Bush", size: 80, opacity: 1 },
    { id: "hedge", label: "Hedge", size: 140, opacity: 1 },
    { id: "moss", label: "Moss", size: 40, opacity: 1 },
  ],
});

export const pineBrush = new StampBrush({
  key: "pine",
  label: "Pine",
  category: "nature",
  maxSize: 400,
  tips: [tip("pine")],
  keepAspect: true,
  spacing: 0.25,
  flow: 1,
  sizeJitter: 0.3,
  sizePressure: 0.3,
  scatter: 0.2,
  angleMode: "fixed",
  angle: -Math.PI / 2,
  flip: true,
  presets: [
    { id: "pine", label: "Pine", size: 150, opacity: 1 },
    { id: "branch", label: "Branches", size: 240, opacity: 1 },
    { id: "small", label: "Small", size: 70, opacity: 1 },
  ],
});

export const treeBrush = new StampBrush({
  key: "tree",
  label: "Bare Tree",
  category: "nature",
  maxSize: 400,
  tips: frames("tree", 5),
  keepAspect: true,
  spacing: 0.7,
  flow: 1,
  sizeJitter: 0.3,
  sizePressure: 0.3,
  angleMode: "fixed",
  flip: true,
  presets: [
    { id: "tree", label: "Tree", size: 220, opacity: 1 },
    { id: "grove", label: "Grove", size: 120, opacity: 1 },
    { id: "giant", label: "Giant", size: 380, opacity: 1 },
  ],
});

export const rav89Brushes = [
  oilBrush,
  rakeBrush,
  flatBristleBrush,
  knifeBrush,
  smearBrush,
  softFlatBrush,
  wetFlatBrush,
  crayonBrush,
  dabsBrush,
  streaksBrush,
  scratchBrush,
  dustBrush,
  cloudsBrush,
  foliageBrush,
  leavesBrush,
  grassBrush,
  bushBrush,
  pineBrush,
  forestBrush,
  treeBrush,
  sparkleBrush,
  starsBrush,
  glintBrush,
];
