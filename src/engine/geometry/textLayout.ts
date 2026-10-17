import type { FontFamilyId } from "../types";

export type Measure = (font: string, text: string) => number;

export const LINE_HEIGHT = 1.25;

export const FONT_STACKS: Record<FontFamilyId, string> = {
  hand: '"Kalam", cursive',
  sans: '"Instrument Sans", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

export function fontString(family: FontFamilyId, size: number) {
  return `${size}px ${FONT_STACKS[family] ?? FONT_STACKS.sans}`;
}

export interface TextLayout {
  lines: string[];
  widths: number[];
  width: number;
  height: number;
  lineHeight: number;
}

function breakWord(word: string, font: string, maxWidth: number, measure: Measure) {
  const parts: string[] = [];
  let current = "";
  for (const ch of word) {
    if (current && measure(font, current + ch) > maxWidth) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

function wrapParagraph(text: string, font: string, maxWidth: number, measure: Measure) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(font, candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (measure(font, word) <= maxWidth) {
      line = word;
      continue;
    }
    const pieces = breakWord(word, font, maxWidth, measure);
    line = pieces.pop() ?? "";
    lines.push(...pieces);
  }
  lines.push(line);
  return lines;
}

export function layoutText(
  text: string,
  fontSize: number,
  family: FontFamilyId,
  maxWidth: number | null,
  measure: Measure,
): TextLayout {
  const font = fontString(family, fontSize);
  const paragraphs = text.split("\n");
  const lines =
    maxWidth === null ? paragraphs : paragraphs.flatMap((p) => wrapParagraph(p, font, Math.max(1, maxWidth), measure));
  const widths = lines.map((l) => measure(font, l));
  const lineHeight = fontSize * LINE_HEIGHT;
  return {
    lines,
    widths,
    width: Math.max(fontSize * 0.5, ...widths),
    height: Math.max(1, lines.length) * lineHeight,
    lineHeight,
  };
}
