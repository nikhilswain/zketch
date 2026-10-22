import type React from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { useVaultStore } from "@/hooks/useStores";
import { CheckIcon, CopyIcon, ExternalLinkIcon, LinkIcon } from "@/components/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { listAllShares, setShareContinue, unshareLinks, type SharedLink } from "@/share/shareClient";
import type { ISavedDrawing } from "@/models/VaultModel";
import EmbedPanel, { type EmbedTarget } from "./EmbedPanel";
import { formatDate } from "@/utils/date";

interface SharedLinksProps {
  onOpenDrawing: (drawingId: string) => void;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const SharePreview: React.FC<{ id: string }> = ({ id }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-zk-raised shadow-(--zk-mini-edge)">
      {failed ? (
        <LinkIcon className="h-4 w-4 text-zk-muted" />
      ) : (
        <img
          src={`/api/shares/${encodeURIComponent(id)}/preview.jpg`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
};

const SharedLinks: React.FC<SharedLinksProps> = observer(({ onOpenDrawing }) => {
  const vaultStore = useVaultStore();
  const [links, setLinks] = useState<SharedLink[]>(() => listAllShares());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [switching, setSwitching] = useState<Set<string>>(new Set());
  const switchingRef = useRef(switching);
  switchingRef.current = switching;
  const [pendingUnshare, setPendingUnshare] = useState<SharedLink[] | null>(null);
  const [unsharing, setUnsharing] = useState(false);
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const [embedFor, setEmbedFor] = useState<EmbedTarget | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (switchingRef.current.size === 0) setLinks(listAllShares());
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const drawingFor = (link: SharedLink): ISavedDrawing | undefined =>
    link.drawingId ? vaultStore.drawings.find((d: ISavedDrawing) => d.id === link.drawingId) : undefined;

  const nameOf = (link: SharedLink) => link.name || drawingFor(link)?.name || "Shared drawing";

  const removeRows = (ids: string[]) => {
    setLinks((current) => current.filter((l) => !ids.includes(l.id)));
    setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
  };

  const copy = async (link: SharedLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(null);
        copiedTimerRef.current = null;
      }, 1500);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const toggleContinue = async (link: SharedLink) => {
    if (switching.has(link.id)) return;
    const next = !link.allowContinue;
    setSwitching((s) => new Set(s).add(link.id));
    setLinks((current) => current.map((l) => (l.id === link.id ? { ...l, allowContinue: next } : l)));
    try {
      const updated = await setShareContinue(link, next);
      setLinks((current) => current.map((l) => (l.id === link.id ? updated : l)));
    } catch (error) {
      if (error instanceof Error && error.message === "gone") {
        removeRows([link.id]);
        toast("That link was already removed");
      } else {
        console.error("Failed to change link:", error);
        setLinks((current) => current.map((l) => (l.id === link.id ? { ...l, allowContinue: link.allowContinue } : l)));
        toast.error("Couldn't change that link. Please try again.");
      }
    } finally {
      setSwitching((s) => {
        const next = new Set(s);
        next.delete(link.id);
        return next;
      });
    }
  };

  const askUnshare = (list: SharedLink[]) => {
    setCount(list.length);
    setPendingUnshare(list);
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmUnshare = async () => {
    if (!pendingUnshare || unsharing) return;
    setUnsharing(true);
    try {
      const { removed, failed } = await unshareLinks(pendingUnshare);
      const remaining = new Set(listAllShares().map((l) => l.id));
      removeRows(pendingUnshare.map((l) => l.id).filter((id) => !remaining.has(id)));
      if (failed > 0) toast.error(`${plural(failed, "link")} couldn't be unshared. Please try again.`);
      else if (removed === 0) toast.error("Couldn't unshare. Please try again.");
    } finally {
      setUnsharing(false);
      setPendingUnshare(null);
    }
  };

  if (links.length === 0) {
    return (
      <div className="py-24 text-center">
        <h2 className="font-display text-[24px] font-semibold">No shared links yet</h2>
        <p className="mt-2 text-[14px] text-zk-muted">Open a drawing and use Share to create a playable link.</p>
      </div>
    );
  }

  const allSelected = links.every((l) => selected.has(l.id));
  const chosen = links.filter((l) => selected.has(l.id));

  return (
    <>
      <div className="flex h-10 items-center justify-between gap-4 border-b border-zk-hairline px-3 pb-2">
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-zk-text-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(links.map((l) => l.id)))}
            className="h-4 w-4 cursor-pointer accent-zk-accent"
          />
          Select all
        </label>
        {chosen.length > 0 && (
          <button
            onClick={() => askUnshare(chosen)}
            className="h-8 rounded-[4px] px-3 text-[13px] font-semibold text-(--zk-danger) hover:bg-zk-raised"
          >
            Unshare selected ({chosen.length})
          </button>
        )}
      </div>
      <ul className="flex flex-col" aria-label="Shared links">
        {links.map((link) => {
          const drawing = drawingFor(link);
          const name = nameOf(link);
          return (
            <li
              key={link.id}
              className="flex items-center gap-4 rounded-[4px] px-3 py-2 text-[13px] text-zk-text-2 hover:bg-zk-raised/60"
            >
              <input
                type="checkbox"
                checked={selected.has(link.id)}
                onChange={() => toggleSelected(link.id)}
                aria-label={`Select ${name}`}
                className="h-4 w-4 shrink-0 cursor-pointer accent-zk-accent"
              />
              <SharePreview id={link.id} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-[15px] font-semibold text-zk-text" title={link.url}>
                  {name}
                </h3>
                <p className="mt-0.5 truncate text-[12px] text-zk-muted">Shared {formatDate(new Date(link.createdAt))}</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] text-zk-text-2">
                Can continue
                <button
                  role="switch"
                  aria-checked={link.allowContinue}
                  aria-label={`Let people continue ${name}`}
                  disabled={switching.has(link.id)}
                  onClick={() => toggleContinue(link)}
                  className={`relative h-[18px] w-8 shrink-0 rounded-[3px] transition-colors disabled:cursor-default disabled:opacity-50 ${link.allowContinue ? "bg-zk-accent" : "bg-zk-hover"}`}
                >
                  <span
                    className={`absolute top-[2px] h-[14px] w-[14px] rounded-[2px] bg-(--zk-knob) shadow-(--zk-knob-shadow) transition-[left] duration-150 ${link.allowContinue ? "left-[16px]" : "left-[2px]"}`}
                  />
                </button>
              </label>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => copy(link)}
                  aria-label={copied === link.id ? "Link copied" : "Copy link"}
                  title={copied === link.id ? "Link copied" : "Copy link"}
                  className="flex h-8 w-8 items-center justify-center rounded-[4px] text-zk-text-2 hover:bg-zk-hover hover:text-zk-text"
                >
                  {copied === link.id ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                </button>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open link"
                  title="Open link"
                  className="flex h-8 w-8 items-center justify-center rounded-[4px] text-zk-text-2 hover:bg-zk-hover hover:text-zk-text"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setEmbedFor({ id: link.id, url: link.url, name })}
                  className="h-8 rounded-[4px] px-2.5 text-[12px] font-semibold text-zk-text-2 hover:bg-zk-hover hover:text-zk-text"
                >
                  Embed
                </button>
                {drawing && (
                  <button
                    onClick={() => onOpenDrawing(drawing.id)}
                    className="h-8 rounded-[4px] px-2.5 text-[12px] font-semibold text-zk-text-2 hover:bg-zk-hover hover:text-zk-text"
                  >
                    Open drawing
                  </button>
                )}
                <button
                  onClick={() => askUnshare([link])}
                  className="h-8 rounded-[4px] px-2.5 text-[12px] font-semibold text-zk-text-2 hover:bg-zk-hover hover:text-(--zk-danger)"
                >
                  Unshare
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!pendingUnshare} onOpenChange={(o) => !o && !unsharing && setPendingUnshare(null)}>
        <DialogContent className="max-w-[400px] gap-5">
          <div>
            <DialogTitle className="text-[24px]">Unshare {plural(count, "link")}?</DialogTitle>
            <DialogDescription className="mt-2 text-[13px] leading-relaxed text-zk-muted">
              {count === 1
                ? "Anyone with it won't be able to open it anymore."
                : "Anyone with them won't be able to open them anymore."}
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingUnshare(null)}
              disabled={unsharing}
              className="h-9 rounded-[4px] px-4 text-[13px] font-medium text-zk-text-2 hover:bg-zk-raised hover:text-zk-text disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmUnshare}
              disabled={unsharing}
              className="h-9 rounded-[4px] bg-[#e5484d] px-4 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {unsharing ? "Unsharing…" : "Unshare"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <EmbedPanel link={embedFor} onClose={() => setEmbedFor(null)} />
    </>
  );
});

export default SharedLinks;
