export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
