import { getSnapshot } from "mobx-state-tree";
import { optimizeStroke, type StrokeData } from "./StrokeOptimizer";

const serializedElements = new WeakMap<object, unknown>();

function serializeElement(el: any) {
  if ("shapeType" in el) {
    return {
      id: el.id,
      shapeType: el.shapeType,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
      strokeColor: el.strokeColor,
      strokeWidth: el.strokeWidth,
      cornerRadius: el.cornerRadius,
      fillColor: el.fillColor ?? null,
      opacity: el.opacity,
    };
  }
  return optimizeStroke({
    id: el.id,
    points: el.points.map((p: any) => ({
      x: p.x,
      y: p.y,
      pressure: p.pressure,
    })),
    color: el.color,
    size: el.size,
    opacity: el.opacity ?? 1,
    brushStyle: el.brushStyle,
    timestamp: el.timestamp,
    startTime: el.startTime ?? null,
    duration: el.duration ?? null,
    thinning: el.thinning,
    smoothing: el.smoothing,
    streamline: el.streamline,
    taperStart: el.taperStart,
    taperEnd: el.taperEnd,
    easing: el.easing,
    angle: el.angle,
    softness: el.softness,
  } as StrokeData);
}

function cachedElement(el: object) {
  let out = serializedElements.get(el);
  if (out === undefined) {
    out = serializeElement(el);
    serializedElements.set(el, out);
  }
  return out;
}

export function serializeLayers(layers: readonly object[]) {
  return layers.map((layer) => {
    const snap = getSnapshot(layer) as any;
    const base = {
      id: snap.id,
      name: snap.name,
      type: snap.type,
      visible: snap.visible,
      locked: snap.locked,
      opacity: snap.opacity,
    };
    if (snap.type === "draw") {
      return {
        ...base,
        elements: (snap.elements ?? []).map(cachedElement),
      };
    }
    if (snap.type === "image") {
      return {
        ...base,
        blobId: snap.blobId,
        naturalWidth: snap.naturalWidth,
        naturalHeight: snap.naturalHeight,
        x: snap.x,
        y: snap.y,
        width: snap.width,
        height: snap.height,
        rotation: snap.rotation,
        aspectLocked: snap.aspectLocked,
      };
    }
    return base;
  });
}
