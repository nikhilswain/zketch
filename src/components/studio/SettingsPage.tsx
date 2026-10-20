import type React from "react";
import ZketchMark from "@/components/ZketchMark";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { useSettingsStore } from "@/hooks/useStores";
import { ACCENTS } from "@/utils/accent";
import { applyLayout, dockLayout, type LayoutId } from "@/utils/dockLayout";
import { KEY_BINDINGS, type KeyBinding } from "@/utils/keyBindings";
import HsvPicker from "./HsvPicker";
import { SURROUND, type SurroundTone } from "@/utils/page";
import type { SurroundMode, ThemePreference } from "@/models/SettingsModel";

const SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout" },
  { id: "canvas", label: "Canvas" },
  { id: "drawing", label: "Drawing" },
  { id: "shortcuts", label: "Shortcuts" },
];

const LAYOUTS: { id: Exclude<LayoutId, "custom">; label: string; hint: string }[] = [
  { id: "bottom", label: "Bottom deck", hint: "Brushes, presets, stroke and colour open above the bar; layers on the right." },
  { id: "sidebars", label: "Sidebars", hint: "Layers and colour on the left; presets, brushes and stroke on the right. The bottom stays one slim bar." },
  { id: "simple", label: "Simple", hint: "One floating toolbar at the bottom and a small properties card, like a whiteboard. Number keys pick tools." },
];

const THEMES: { id: ThemePreference; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Cool, quiet greys. The default." },
  { id: "dark", label: "Dark", hint: "Deep charcoal, easy on the eyes at night." },
  { id: "system", label: "Match system", hint: "Follows your device's light or dark setting." },
];

const SURROUNDS: { id: SurroundMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Matches the theme." },
  { id: "light", label: "Light", hint: "Always light grey." },
  { id: "dark", label: "Dark", hint: "Always near-black." },
];

const PREVIEW = {
  light: { surround: SURROUND.light, panel: "#F4F5F7", raised: "#E9EBEE", line: "#C9CDD3", edge: "rgba(28,34,44,0.1)" },
  dark: { surround: SURROUND.dark, panel: "#141416", raised: "#202024", line: "#3A3A40", edge: "rgba(0,0,0,0)" },
} as const;

function StudioPreview({ theme }: { theme: SurroundTone }) {
  const c = PREVIEW[theme];
  const block = { background: c.panel, boxShadow: `0 0 0 1px ${c.edge}` };
  return (
    <div className="absolute inset-0" style={{ background: c.surround }}>
      <div className="absolute top-1.5 left-1.5 flex h-3 w-14 items-center gap-1 rounded-[2px] px-1" style={block}>
        <span className="h-1.5 w-1.5 rounded-[1px] bg-zk-accent" />
        <span className="h-1 w-7 rounded-full" style={{ background: c.line }} />
      </div>
      <div className="absolute top-1.5 right-1.5 flex h-3 w-9 items-center justify-end rounded-[2px] px-0.5" style={block}>
        <span className="h-2 w-4 rounded-[1px] bg-zk-accent" />
      </div>
      <div className="absolute top-6 bottom-1.5 left-1.5 flex w-3 flex-col items-center gap-1 rounded-[2px] pt-1" style={block}>
        <span className="h-1.5 w-1.5 rounded-[1px] ring-1 ring-zk-accent" />
        <span className="h-1.5 w-1.5 rounded-[1px]" style={{ background: c.line }} />
        <span className="h-1.5 w-1.5 rounded-[1px]" style={{ background: c.line }} />
      </div>
      <div className="absolute top-6 right-1.5 bottom-1.5 flex w-10 flex-col gap-1 rounded-[2px] p-1" style={block}>
        <span className="h-1 w-6 rounded-full" style={{ background: c.line }} />
        <span className="h-2.5 rounded-[1px]" style={{ background: c.raised }} />
        <span className="h-2.5 rounded-[1px]" style={{ background: c.raised }} />
      </div>
      <div className="absolute top-6 right-[52px] bottom-2.5 left-6 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)]">
        <svg viewBox="0 0 60 30" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
          <path d="M8 22 C 18 6, 26 6, 32 16 S 46 26, 52 8" fill="none" stroke="#1F2126" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}

function ThemePreview({ theme }: { theme: ThemePreference }) {
  return (
    <div className="relative h-24 w-full overflow-hidden rounded-[4px] shadow-[0_0_0_1px_var(--zk-divider)]" aria-hidden="true">
      {theme === "system" ? (
        <>
          <StudioPreview theme="light" />
          <div className="absolute inset-0" style={{ clipPath: "polygon(62% 0, 100% 0, 100% 100%, 38% 100%)" }}>
            <StudioPreview theme="dark" />
          </div>
        </>
      ) : (
        <StudioPreview theme={theme} />
      )}
    </div>
  );
}

function SurroundPreview({ tone }: { tone: SurroundTone | "split" }) {
  const background =
    tone === "split" ? `linear-gradient(115deg, ${SURROUND.light} 0 50%, ${SURROUND.dark} 50% 100%)` : SURROUND[tone];
  return (
    <span className="flex h-12 w-full items-center justify-center rounded-[4px]" style={{ background }}>
      <span className="h-8 w-6 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]" />
    </span>
  );
}

const BACKGROUNDS = [
  { id: "white", label: "White" },
  { id: "transparent", label: "Transparent" },
  { id: "grid", label: "Grid" },
] as const;

const TOUCH = [
  { id: "auto", label: "Auto", hint: "Pen and finger both draw; two fingers pan and zoom." },
  { id: "stylus-only", label: "Stylus only", hint: "Only the pen draws; one finger pans, so a resting palm never paints." },
  { id: "touch-draw", label: "Finger draws", hint: "A single finger draws, for tablets without a stylus." },
] as const;

const ERASER = [
  { mode: "element", label: "Whole elements", hint: "Anything the eraser touches fades, and is deleted when you lift." },
  { mode: "pixel", label: "Pixels", hint: "Rubs out only the parts it touches, shapes included." },
  { mode: "smart", label: "Smart", hint: "Rubs out brush strokes like Pixels; removes shapes, arrows and text whole." },
] as const;

function Schematic({ id }: { id: Exclude<LayoutId, "custom"> }) {
  const panel = "rounded-[2px] bg-zk-divider";
  return (
    <div className="relative h-20 w-full overflow-hidden rounded-[4px] bg-[#FBFAF6]">
      {id !== "simple" && <div className="absolute inset-x-0 bottom-0 h-2 bg-zk-surface" />}
      {id === "bottom" && (
        <>
          <div className={`absolute inset-x-0 bottom-2 h-6 ${panel}`} />
          <div className={`absolute top-0 right-0 bottom-8 w-6 ${panel}`} />
        </>
      )}
      {id === "sidebars" && (
        <>
          <div className={`absolute top-0 bottom-2 left-0 w-6 ${panel}`} />
          <div className={`absolute top-0 right-0 bottom-2 w-9 ${panel}`} />
        </>
      )}
      {id === "simple" && (
        <>
          <div className={`absolute top-3 left-1.5 h-9 w-6 ${panel}`} />
          <div className={`absolute bottom-1.5 left-1/2 h-2.5 w-16 -translate-x-1/2 ${panel}`} />
        </>
      )}
    </div>
  );
}

function keyLabel(b: KeyBinding) {
  const parts: string[] = [];
  if (b.ctrlKey) parts.push("Ctrl");
  if (b.metaKey) parts.push("Cmd");
  if (b.altKey) parts.push("Alt");
  if (b.shiftKey) parts.push("Shift");
  const k = b.key === " " ? "Space" : b.key.length === 1 ? b.key.toUpperCase() : b.key;
  parts.push(k);
  return parts;
}

const Option: React.FC<{
  selected: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
  children?: React.ReactNode;
}> = ({ selected, label, hint, onClick, children }) => (
  <button
    onClick={onClick}
    aria-pressed={selected}
    className={`flex flex-col gap-2 rounded-[6px] p-3 text-left transition-colors ${
      selected ? "bg-zk-selected" : "bg-zk-raised/60 hover:bg-zk-raised"
    }`}
  >
    {children}
    <span className="flex items-center gap-2 text-[14px] font-semibold text-zk-text">
      {label}
      {selected && <CheckIcon className="h-3.5 w-3.5 text-zk-accent" />}
    </span>
    {hint && <span className="text-[12px] leading-relaxed text-zk-muted">{hint}</span>}
  </button>
);

const Section: React.FC<{ id: string; title: string; lead?: string; children: React.ReactNode }> = ({
  id,
  title,
  lead,
  children,
}) => (
  <section id={`settings-${id}`} aria-labelledby={`settings-${id}-title`} className="scroll-mt-6 border-b border-zk-hairline pb-10">
    <h2 id={`settings-${id}-title`} className="font-display text-[28px] font-semibold text-zk-text">
      {title}
    </h2>
    {lead && <p className="mt-1 mb-5 max-w-xl text-[13px] text-zk-muted">{lead}</p>}
    {!lead && <div className="mb-5" />}
    {children}
  </section>
);

const SettingsPage: React.FC<{ onClose: () => void }> = observer(({ onClose }) => {
  const settings = useSettingsStore();
  const scroller = useRef<HTMLDivElement>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const accent = settings.accent.toUpperCase();
  const isPreset = ACCENTS.some((a) => a.hex === accent);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bindings = Object.values(KEY_BINDINGS).filter(
    (b, i, all) => all.findIndex((o) => o.action === b.action) === i,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        e.stopPropagation();
      }}
      className="fixed inset-0 z-50 flex bg-zk-surface font-ui text-zk-text"
    >
      <nav aria-label="Settings sections" className="hidden w-56 shrink-0 flex-col gap-1 border-r border-zk-hairline px-4 py-6 md:flex">
        <h1 className="mb-4 px-2 font-display text-[32px] font-semibold">Settings</h1>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() =>
              document.getElementById(`settings-${s.id}`)?.scrollIntoView({ behavior: "smooth" })
            }
            className="h-8 rounded-[4px] px-2 text-left text-[14px] text-zk-text-2 hover:bg-zk-raised hover:text-zk-text"
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div ref={scroller} className="relative min-w-0 flex-1 overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="sticky top-4 float-right mr-4 flex h-9 w-9 items-center justify-center rounded-[6px] bg-zk-raised text-zk-text hover:bg-zk-hover"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
        <div className="mx-auto flex max-w-3xl flex-col gap-10 px-8 py-8">
          <Section id="appearance" title="Appearance" lead="How zketch looks around your drawing. The page you draw on stays white in every theme.">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zk-muted">Theme</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {THEMES.map((t) => (
                <Option key={t.id} selected={settings.theme === t.id} label={t.label} hint={t.hint} onClick={() => settings.setTheme(t.id)}>
                  <ThemePreview theme={t.id} />
                </Option>
              ))}
            </div>
            <h3 className="mt-8 mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zk-muted">Accent</h3>
            <p className="mb-3 max-w-xl text-[13px] text-zk-muted">
              Marks the active tool, primary buttons, the slider you drag, the active layer and selections on the canvas.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACCENTS.map((a) => (
                <Option key={a.id} selected={accent === a.hex} label={a.name} onClick={() => settings.setAccent(a.hex)}>
                  <span className="h-10 w-full rounded-[4px]" style={{ background: a.hex }} />
                </Option>
              ))}
              <Option selected={!isPreset} label="Custom" onClick={() => setCustomOpen((v) => !v)}>
                <span
                  className="h-10 w-full rounded-[4px]"
                  style={{
                    background: isPreset
                      ? "conic-gradient(#FF4F9A, #FF6B5B, #F5A524, #46A758, #4D8BFF, #9B6BFF, #FF4F9A)"
                      : accent,
                  }}
                />
              </Option>
            </div>
            {customOpen && (
              <div className="mt-4 flex gap-6 rounded-[6px] bg-zk-raised/60 p-4">
                <HsvPicker value={accent} onChange={(hex) => settings.setAccent(hex)} size={180} />
                <p className="max-w-xs text-[12px] leading-relaxed text-zk-muted">
                  Pick any colour. Mid-to-bright colours work best: the accent sits on the interface in both
                  themes and on your white page, and text on accent buttons is dark.
                </p>
              </div>
            )}
            <div className="mt-6 flex items-center gap-4 rounded-[6px] bg-zk-raised/60 p-4">
              <span className="text-[12px] text-zk-muted">Preview</span>
              <span className="zk-logo-hover flex h-7 w-7 items-center justify-center">
                <ZketchMark size={26} />
              </span>
              <span className="h-8 rounded-[4px] bg-zk-accent px-3.5 text-[13px] leading-8 font-semibold text-zk-on-accent">Share</span>
              <span className="h-1.5 w-28 rounded-[2px] bg-zk-hover">
                <span className="block h-full w-16 rounded-[2px] bg-zk-accent" />
              </span>
              <span className="h-10 w-16 rounded-[2px] border-[1.5px] border-zk-accent bg-[#FBFAF6]" />
            </div>
          </Section>

          <Section id="layout" title="Layout" lead="Where panels live. You can still drag any panel by its grip to another dock; that becomes your Custom layout.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {LAYOUTS.map((l) => (
                <Option key={l.id} selected={dockLayout.state.layout === l.id} label={l.label} hint={l.hint} onClick={() => applyLayout(l.id)}>
                  <Schematic id={l.id} />
                </Option>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3 text-[13px]">
              <span className="text-zk-muted">
                Current: <span className="font-semibold text-zk-text">{dockLayout.state.layout === "custom" ? "Custom" : LAYOUTS.find((l) => l.id === dockLayout.state.layout)?.label}</span>
              </span>
              <button onClick={() => applyLayout("bottom")} className="h-8 rounded-[4px] bg-zk-raised px-3 text-zk-text hover:bg-zk-hover">
                Reset panel positions
              </button>
            </div>
          </Section>

          <Section id="canvas" title="Canvas" lead="The background new drawings start with. Change the current drawing's background from the Z menu.">
            <div className="grid grid-cols-3 gap-2">
              {BACKGROUNDS.map((b) => (
                <Option key={b.id} selected={settings.defaultBackground === b.id} label={b.label} onClick={() => settings.setDefaults({ background: b.id })}>
                  <span
                    className="h-12 w-full rounded-[4px]"
                    style={{
                      background:
                        b.id === "white"
                          ? "#FFFFFF"
                          : b.id === "grid"
                            ? "repeating-linear-gradient(0deg, transparent 0 9px, #E5E5E5 9px 10px), repeating-linear-gradient(90deg, transparent 0 9px, #E5E5E5 9px 10px) #FFFFFF"
                            : "repeating-conic-gradient(var(--zk-checker-a) 0% 25%, var(--zk-checker-b) 0% 50%) 0 0 / 10px 10px",
                    }}
                  />
                </Option>
              ))}
            </div>
            <p className="mb-3 mt-6 text-[13px] text-zk-muted">Around fixed-size pages, the workspace outside the page.</p>
            <div className="grid grid-cols-3 gap-2">
              {SURROUNDS.map((t) => (
                <Option key={t.id} selected={settings.surroundMode === t.id} label={t.label} hint={t.hint} onClick={() => settings.setSurroundMode(t.id)}>
                  <SurroundPreview tone={t.id === "auto" ? "split" : t.id} />
                </Option>
              ))}
            </div>
          </Section>

          <Section id="drawing" title="Drawing">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zk-muted">Touch &amp; stylus</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TOUCH.map((t) => (
                <Option key={t.id} selected={settings.touchMode === t.id} label={t.label} hint={t.hint} onClick={() => settings.setTouchMode(t.id)} />
              ))}
            </div>
            <h3 className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zk-muted">Eraser</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ERASER.map((e) => (
                <Option key={e.label} selected={settings.eraserMode === e.mode} label={e.label} hint={e.hint} onClick={() => settings.setEraserMode(e.mode)} />
              ))}
            </div>
          </Section>

          <Section id="shortcuts" title="Shortcuts">
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {bindings.map((b) => (
                <div key={b.action} className="flex items-center justify-between gap-4 border-b border-zk-hairline py-2.5 text-[13px]">
                  <span className="text-zk-text-2">{b.description}</span>
                  <span className="flex gap-1">
                    {keyLabel(b).map((k) => (
                      <kbd key={k} className="min-w-6 rounded-[3px] bg-zk-raised px-1.5 py-0.5 text-center font-ui text-[11px] font-semibold text-zk-text">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
});

export default SettingsPage;
