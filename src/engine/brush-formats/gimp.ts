export interface GimpBrush {
  name: string;
  width: number;
  height: number;
  bytesPerPixel: number;
  spacing: number;
  pixels: Uint8Array;
  byteLength: number;
}

export interface GimpPipe {
  name: string;
  params: Record<string, string>;
  frames: GimpBrush[];
}

const decoder = new TextDecoder();

export function parseGbr(data: Uint8Array, offset = 0): GimpBrush {
  const view = new DataView(data.buffer, data.byteOffset + offset);
  const headerSize = view.getUint32(0);
  const version = view.getUint32(4);
  const width = view.getUint32(8);
  const height = view.getUint32(12);
  const bytesPerPixel = view.getUint32(16);
  let nameStart = 20;
  let spacing = 25;
  if (version >= 2) {
    const magic = decoder.decode(data.subarray(offset + 20, offset + 24));
    if (magic !== "GIMP") throw new Error("Not a GIMP brush");
    spacing = view.getUint32(24);
    nameStart = 28;
  } else if (version !== 1) {
    throw new Error(`Unsupported GIMP brush version ${version}`);
  }
  if (
    width === 0 ||
    height === 0 ||
    (bytesPerPixel !== 1 && bytesPerPixel !== 4) ||
    headerSize < nameStart
  ) {
    throw new Error("Invalid GIMP brush header");
  }
  const nameBytes = data.subarray(offset + nameStart, offset + headerSize);
  const nul = nameBytes.indexOf(0);
  const name = decoder.decode(nul >= 0 ? nameBytes.subarray(0, nul) : nameBytes);
  const size = width * height * bytesPerPixel;
  const start = offset + headerSize;
  if (start + size > data.length) throw new Error("Truncated GIMP brush");
  return {
    name,
    width,
    height,
    bytesPerPixel,
    spacing,
    pixels: data.slice(start, start + size),
    byteLength: headerSize + size,
  };
}

export function parseGih(data: Uint8Array): GimpPipe {
  const firstBreak = data.indexOf(10);
  const secondBreak = data.indexOf(10, firstBreak + 1);
  if (firstBreak < 0 || secondBreak < 0) throw new Error("Invalid GIMP pipe");
  const name = decoder.decode(data.subarray(0, firstBreak)).trim();
  const line = decoder.decode(data.subarray(firstBreak + 1, secondBreak)).trim();
  const [countToken, ...pairs] = line.split(/\s+/);
  const count = Number.parseInt(countToken, 10);
  const params: Record<string, string> = {};
  for (const pair of pairs) {
    const i = pair.indexOf(":");
    if (i > 0) params[pair.slice(0, i)] = pair.slice(i + 1);
  }
  const frames: GimpBrush[] = [];
  let offset = secondBreak + 1;
  for (let n = 0; n < count && offset < data.length; n++) {
    const frame = parseGbr(data, offset);
    frames.push(frame);
    offset += frame.byteLength;
  }
  return { name, params, frames };
}
