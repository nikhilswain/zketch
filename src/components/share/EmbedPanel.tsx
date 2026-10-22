import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  embedSize,
  embedUrl,
  iframeCode,
  pictureHtml,
  pictureMarkdown,
  type Aspect,
  type EmbedMode,
} from "@/share/embedCode";

export type EmbedTarget = { id: string; url: string; name: string };

interface EmbedPanelProps {
  link: EmbedTarget | null;
  onClose: () => void;
}

interface EmbedViewProps {
  link: EmbedTarget;
  onBack?: () => void;
  className?: string;
}

type Format = "iframe" | "html" | "md";

const MODES: { id: EmbedMode; label: string; hint: string }[] = [
  { id: "tap", label: "Tap to play", hint: "Still until clicked" },
  { id: "auto", label: "Autoplay", hint: "Draws when on screen" },
  { id: "picture", label: "Picture", hint: "Still image, links here" },
];

const FORMATS: { id: Format; label: string }[] = [
  { id: "iframe", label: "Embed code" },
  { id: "html", label: "HTML image" },
  { id: "md", label: "Markdown" },
];

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zk-muted">{children}</h3>
);

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return typeof window === "undefined" ? "" : window.location.origin;
  }
}

export const EmbedView: React.FC<EmbedViewProps> = ({ link, onBack, className = "" }) => {
  const [mode, setMode] = useState<EmbedMode>("tap");
  const [loop, setLoop] = useState(false);
  const [format, setFormat] = useState<Format>("iframe");
  const [aspect, setAspect] = useState<Aspect>({ width: 4, height: 3 });
  const [sized, setSized] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    setMode("tap");
    setLoop(false);
    setFormat("iframe");
    setCopied(false);
    setAspect({ width: 4, height: 3 });
    setSized(false);
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspect({ width: img.naturalWidth, height: img.naturalHeight });
      }
      setSized(true);
    };
    img.onerror = () => {
      if (live) setSized(true);
    };
    img.src = `/api/shares/${encodeURIComponent(link.id)}/preview.jpg`;
    return () => {
      live = false;
    };
  }, [link.id]);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const shown = mode === "picture" ? format : "iframe";
  const target = { origin: originOf(link.url), id: link.id, name: link.name };
  const code =
    shown === "html"
      ? pictureHtml(target)
      : shown === "md"
        ? pictureMarkdown(target)
        : iframeCode({ ...target, mode, loop, aspect });
  const size = embedSize(aspect, mode);
  const ratio = size.width / size.height;
  const previewSrc = embedUrl({ origin: "", id: link.id, mode, loop });

  const copy = async () => {
    if (!sized) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimer.current = null;
      }, 1400);
    } catch {
      toast.error("Couldn't copy the code. Select it and copy manually.");
    }
  };

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col md:flex-row ${className}`}>
      <div className="flex h-[200px] shrink-0 items-center justify-center bg-(--zk-well) p-4 md:h-auto md:min-h-[520px] md:min-w-0 md:flex-1 md:p-8">
        <div className="flex h-full w-full items-center justify-center" style={{ containerType: "size" }}>
          <iframe
              key={previewSrc}
              src={previewSrc}
              title={`${link.name} — embed preview`}
              className="block rounded-[8px] border-0"
              style={{ aspectRatio: `${size.width} / ${size.height}`, width: `min(100cqw, calc(100cqh * ${ratio}))` }}
          />
        </div>
      </div>

      <div className="flex min-h-0 w-full shrink flex-col overflow-y-auto px-6 pt-6 pb-5 md:w-[340px] md:shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-3 -ml-1.5 flex h-7 items-center gap-1 self-start rounded-[4px] px-1.5 text-[12px] font-semibold text-zk-text-2 hover:bg-zk-raised hover:text-zk-text"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>
        )}
        <DialogTitle className="text-[26px]">Embed</DialogTitle>
        <DialogDescription className="mt-1 text-[13px] text-zk-muted">
          Put this drawing on a blog, docs or a portfolio.
        </DialogDescription>

        <div className="mt-5">
          <SectionLabel>How it behaves</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="How it behaves">
            {MODES.map((m) => {
              const selected = mode === m.id;
              return (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMode(m.id)}
                  className={`flex flex-col items-start gap-0.5 rounded-[4px] px-2.5 py-2 text-left transition-colors ${
                    selected ? "bg-zk-selected shadow-[0_0_0_1.5px_var(--zk-accent)]" : "bg-zk-raised/50 hover:bg-zk-raised"
                  }`}
                >
                  <span className="text-[13px] font-semibold text-zk-text">{m.label}</span>
                  <span className="text-[11px] leading-snug text-zk-muted">{m.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {mode === "auto" && (
          <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-zk-text-2">
            <span>Loop</span>
            <button
              role="switch"
              aria-checked={loop}
              aria-label="Loop"
              onClick={() => setLoop(!loop)}
              className={`relative h-[18px] w-8 shrink-0 rounded-[3px] transition-colors ${loop ? "bg-zk-accent" : "bg-zk-hover"}`}
            >
              <span
                className={`absolute top-[2px] h-[14px] w-[14px] rounded-[2px] bg-(--zk-knob) shadow-(--zk-knob-shadow) transition-[left] duration-150 ${loop ? "left-[16px]" : "left-[2px]"}`}
              />
            </button>
          </div>
        )}

        <div className="mt-4 flex gap-1" role="tablist" aria-label="Code format">
          {FORMATS.filter((f) => f.id === "iframe" || mode === "picture").map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={shown === f.id}
              onClick={() => setFormat(f.id)}
              className={`h-7 rounded-[4px] px-2 text-[12px] transition-colors ${
                shown === f.id ? "bg-zk-raised font-semibold text-zk-text" : "text-zk-muted hover:text-zk-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <pre
          aria-label="Code"
          className="mt-1.5 max-h-[120px] overflow-auto rounded-[4px] bg-zk-raised/60 p-2.5 font-['JetBrains_Mono',ui-monospace,monospace] text-[11px] leading-normal break-all whitespace-pre-wrap text-zk-text-2 select-all"
        >
          {code}
        </pre>
        <button
          onClick={copy}
          disabled={!sized}
          className="mt-3 flex h-10 w-full shrink-0 items-center justify-center rounded-[4px] bg-zk-accent text-[14px] font-semibold text-zk-on-accent transition-[filter] hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
        >
          {copied ? "Copied ✓" : "Copy code"}
        </button>
        <p className="mt-2.5 text-[12px] leading-snug text-zk-muted">
          Tip: in Notion, Medium and similar apps you can also just paste the share link.
        </p>
      </div>
    </div>
  );
};

const EmbedPanel: React.FC<EmbedPanelProps> = ({ link, onClose }) => (
  <Dialog open={!!link} onOpenChange={(open) => !open && onClose()}>
    <DialogContent
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement | null)?.focus();
      }}
      className="flex max-h-[calc(100dvh-32px)] max-w-[880px] flex-col gap-0 overflow-hidden p-0 md:flex-row"
    >
      {link && <EmbedView link={link} />}
    </DialogContent>
  </Dialog>
);

export default EmbedPanel;
