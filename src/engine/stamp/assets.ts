import { createCanvas } from "../render/canvasFactory";
import { registerTipMask, setTipLoader } from "./tips";
import { registerGrain, setGrainLoader } from "./grain";

const listeners = new Set<() => void>();
const requested = new Set<string>();
let inflight = 0;
let base = "/brushes/";

async function decode(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = createCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

function notify() {
  for (const fn of listeners) fn();
}

function request(kind: "tip" | "grain", id: string) {
  const key = `${kind}:${id}`;
  if (requested.has(key)) return;
  requested.add(key);
  inflight++;
  decode(`${base}${id}.png`)
    .then((canvas) => {
      if (kind === "tip") {
        registerTipMask(id, canvas);
      } else {
        const size = Math.min(canvas.width, canvas.height);
        const data = canvas
          .getContext("2d")!
          .getImageData(0, 0, size, size).data;
        const values = new Float32Array(size * size);
        for (let i = 0; i < values.length; i++) values[i] = data[i * 4] / 255;
        registerGrain(id, values, size);
      }
      inflight--;
      notify();
    })
    .catch((error) => {
      inflight--;
      notify();
      console.warn("Brush asset failed to load", id, error);
    });
}

export function installBrushAssetLoader(baseUrl = "/brushes/") {
  if (typeof fetch === "undefined" || typeof createImageBitmap === "undefined") {
    return;
  }
  base = baseUrl;
  setTipLoader((id) => request("tip", id));
  setGrainLoader((id) => request("grain", id));
}

export function brushAssetsPending() {
  return inflight;
}

export function onBrushAssetsChanged(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function whenBrushAssetsReady(timeout = 5000): Promise<boolean> {
  if (!inflight) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), timeout);
    const off = onBrushAssetsChanged(() => {
      if (!inflight) finish(true);
    });
    function finish(ready: boolean) {
      clearTimeout(timer);
      off();
      resolve(ready);
    }
  });
}
