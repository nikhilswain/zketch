export type EmbedMode = "tap" | "auto" | "picture";

export type Aspect = { width: number; height: number };

export const EMBED_WIDTH = 640;
export const STRIP_PX = 24;

type Target = { origin: string; id: string };

type Named = Target & { name: string };

export function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\[\]()]/g, "\\$&");
}

function credit(name: string): string {
  return `${name} — drawn in zketch`;
}

export function embedSize(aspect: Aspect, mode: EmbedMode, width = EMBED_WIDTH): { width: number; height: number } {
  const ok = aspect.width > 0 && aspect.height > 0;
  const w = ok ? aspect.width : 4;
  const h = ok ? aspect.height : 3;
  const picture = Math.max(1, Math.round((width * h) / w));
  return { width, height: picture + (mode === "picture" ? 0 : STRIP_PX) };
}

export function shareUrl({ origin, id }: Target): string {
  return `${origin}/share/${id}`;
}

export function pictureUrl({ origin, id }: Target): string {
  return `${origin}/api/shares/${id}/picture.png`;
}

export function embedUrl({ origin, id, mode, loop }: Target & { mode: EmbedMode; loop: boolean }): string {
  const query = mode === "tap" ? "" : mode === "auto" ? `?mode=auto${loop ? "&loop=1" : ""}` : "?mode=picture";
  return `${origin}/embed/${id}${query}`;
}

export function iframeCode(input: Named & { mode: EmbedMode; loop: boolean; aspect: Aspect }): string {
  const { width, height } = embedSize(input.aspect, input.mode);
  return `<iframe src="${embedUrl(input)}" title="${escapeAttr(credit(input.name))}" style="width:100%;aspect-ratio:${width}/${height};border:0;border-radius:8px" loading="lazy"></iframe>`;
}

export function pictureHtml(input: Named): string {
  return `<a href="${shareUrl(input)}"><img src="${pictureUrl(input)}" alt="${escapeAttr(credit(input.name))}" width="${EMBED_WIDTH}"></a>`;
}

export function pictureMarkdown(input: Named): string {
  return `[![${escapeMarkdown(credit(input.name))}](${pictureUrl(input)})](${shareUrl(input)})`;
}
