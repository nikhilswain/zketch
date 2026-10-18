import type React from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { fontString, labelPlacement, layoutText, LINE_HEIGHT } from "@/engine/geometry";
import { buildElementLookup } from "@/engine/render/lookup";
import { measureText, requestFont } from "@/engine/render/fonts";

export const activeTextEditor: { commit: (() => void) | null } = { commit: null };

interface TextEditorOverlayProps {
  onDone: (id: string, kept: boolean) => void;
}

const TextEditorOverlay: React.FC<TextEditorOverlayProps> = observer(({ onDone }) => {
  const canvasStore = useCanvasStore();
  const id = canvasStore.editingTextId;
  const found = id ? canvasStore.findElementById(id) : null;
  const el = found?.element;
  const [value, setValue] = useState<string>(el?.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    done.current = false;
    setValue(el?.text ?? "");
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, [id]);

  useEffect(() => {
    if (el) requestFont(el.fontFamily);
  }, [el?.fontFamily]);

  const commit = () => {
    if (!id || done.current) return;
    done.current = true;
    const kept = !!value.trim();
    canvasStore.commitTextEdit(id, value);
    onDone(id, kept);
  };

  useEffect(() => {
    activeTextEditor.commit = commit;
    return () => {
      if (activeTextEditor.commit === commit) activeTextEditor.commit = null;
    };
  });

  if (!id || !el) return null;

  const zoom = canvasStore.zoom;
  const isLabel = !!el.containerId;
  let box = { x: el.x, y: el.y, width: 0, height: 0, rotation: el.rotation ?? 0 };
  let wrap: number | null = null;
  if (isLabel) {
    const lookup = buildElementLookup(canvasStore.layers as any);
    const container = lookup.get(el.containerId);
    const placement = container
      ? labelPlacement(container, { ...(el as any), text: value || " " }, lookup, measureText)
      : null;
    if (placement) {
      box = placement.box;
      wrap = placement.maxWidth;
    }
  } else {
    const layout = layoutText(value || " ", el.fontSize, el.fontFamily, null, measureText);
    box = { ...box, width: layout.width, height: layout.height };
  }

  const pad = wrap === null ? el.fontSize / 2 : 0;
  const width = (box.width + pad * 2) * zoom;
  const left = (box.x - pad) * zoom + canvasStore.panX;

  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <textarea
        ref={ref}
        value={value}
        aria-label={isLabel ? "Label text" : "Text"}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            commit();
          }
        }}
        onKeyUp={(e) => e.stopPropagation()}
        rows={1}
        className="pointer-events-auto absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
        style={{
          left,
          top: box.y * zoom + canvasStore.panY,
          width,
          height: box.height * zoom,
          paddingLeft: pad * zoom,
          paddingRight: pad * zoom,
          font: fontString(el.fontFamily, el.fontSize * zoom),
          lineHeight: `${el.fontSize * LINE_HEIGHT * zoom}px`,
          color: el.color,
          opacity: el.opacity,
          textAlign: isLabel ? "center" : el.align,
          whiteSpace: wrap !== null ? "pre-wrap" : "pre",
          caretColor: "var(--zk-accent)",
          transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
          transformOrigin: "center",
        }}
      />
    </div>
  );
});

export default TextEditorOverlay;
