# Zketch icons

A brush-drawn icon set: one even, hand-drawn line with generously rounded corners.
This folder is self-contained; it can be copied anywhere and used on its own.

## Files

- `svg/<name>.svg`: one standalone SVG per icon.
- `sprite.svg`: every icon as a `<symbol id="<name>">`.
- `defs/`: the drawings, written as centrelines (rounded polygons, paths, circles, arcs, dots).
- `lib/`, `build.mjs`: the generator that turns the drawings into SVG.

## Style

- 24 x 24 grid, drawing kept roughly inside 3..21.
- Stroke 2.2, round caps and joins, no fill, colour from `currentColor`.
- One even line weight. Straight edges bow very slightly; the bow is seeded from the icon name,
  so every build draws the same line.
- Rounded corners wherever a shape has one; no sharp points.
- Few strokes per icon, each one a single pen movement.

## Using the icons

Inline an SVG file to let it take the text colour:

```html
<span style="color:#FF6B5B">
  <svg width="18" height="18"><use href="sprite.svg#pencil" /></svg>
</span>
```

Or use a file directly as an image (`<img src="svg/pencil.svg">`); as an image it draws in black,
because `currentColor` only works for inline SVG.

## Building

`node build.mjs` regenerates `svg/` and `sprite.svg`. Add `--gallery <file.html>` to also write
a contact sheet of every icon at 14, 18, 24 and 56 px.
