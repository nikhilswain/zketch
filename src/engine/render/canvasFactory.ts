type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

let factory: CanvasFactory | null = null;

export function setCanvasFactory(next: CanvasFactory | null) {
  factory = next;
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (factory) return factory(width, height);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
}
