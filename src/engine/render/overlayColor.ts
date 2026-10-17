let accent = "#FF6B5B";

export function setOverlayAccent(color: string) {
  accent = color;
}

export function overlayAccent() {
  return accent;
}

export function overlayAccentFill() {
  return /^#[0-9a-fA-F]{6}$/.test(accent) ? `${accent}14` : accent;
}
