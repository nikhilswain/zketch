import type React from "react";
import ZketchMark from "@/components/ZketchMark";
import { useState } from "react";
import { CheckIcon, DownloadIcon, LinkIcon, LoaderIcon } from "@/components/icons";
import { toast } from "sonner";
import type { ShareData } from "@/services/ShareService";

interface ShareViewerProps {
  loading: boolean;
  error: string | null;
  drawing: ShareData | null;
  onRetry?: () => void;
  expiryNote?: boolean;
}

function fileName(drawing: ShareData) {
  const ext = drawing.data.startsWith("data:image/jpeg") ? "jpg" : "png";
  const base = drawing.name.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "drawing";
  return `${base}.${ext}`;
}

const Mark: React.FC = () => (
  <a href="/" className="zk-logo-hover flex items-center gap-2.5" aria-label="Zketch home">
    <ZketchMark size={32} />
    <span className="font-display text-[20px] font-semibold text-zk-text">Zketch</span>
  </a>
);

const ShareViewer: React.FC<ShareViewerProps> = ({ loading, error, drawing, onRetry, expiryNote = true }) => {
  const [copied, setCopied] = useState(false);

  const download = () => {
    if (!drawing) return;
    const link = document.createElement("a");
    link.href = drawing.data;
    link.download = fileName(drawing);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zk-surface font-ui text-zk-text">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zk-hairline px-6 sm:px-10">
        <Mark />
        <a
          href="/draw"
          className="flex h-9 items-center rounded-[4px] bg-zk-accent px-4 text-[14px] font-semibold text-zk-on-accent hover:brightness-110"
        >
          Make your own
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-zk-muted">
            <LoaderIcon className="h-6 w-6 animate-spin" />
            <p className="text-[13px]">Loading the drawing…</p>
          </div>
        ) : error || !drawing ? (
          <div className="max-w-md text-center">
            <h1 className="font-display text-[32px] font-semibold">This link doesn’t open</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-zk-muted">
              {(error || "The drawing couldn't be found").replace(/\.?\s*$/, ".")}
              {expiryNote && " Share links expire 30 days after they're created."}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="h-10 rounded-[4px] bg-zk-raised px-4 text-[14px] font-medium text-zk-text hover:bg-zk-hover"
                >
                  Try again
                </button>
              )}
              <a
                href="/"
                className="flex h-10 items-center rounded-[4px] bg-zk-accent px-4 text-[14px] font-semibold text-zk-on-accent hover:brightness-110"
              >
                Go to Zketch
              </a>
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-[1100px] flex-col items-center">
            <div className="mb-6 text-center">
              <h1 className="font-display text-[36px] leading-tight font-semibold">{drawing.name || "Untitled drawing"}</h1>
              {drawing.timestamp > 0 && (
                <p className="mt-2 text-[13px] text-zk-muted">
                  Shared{" "}
                  {new Date(drawing.timestamp).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
            <img
              src={drawing.data}
              alt={drawing.name}
              className="max-h-[60vh] max-w-full rounded-[4px] bg-white shadow-(--zk-shadow-share)"
            />
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <button
                onClick={download}
                className="flex h-10 items-center gap-2 rounded-[4px] bg-zk-accent px-5 text-[14px] font-semibold text-zk-on-accent hover:brightness-110"
              >
                <DownloadIcon className="h-4 w-4" />
                Download
              </button>
              <button
                onClick={copyLink}
                className="flex h-10 items-center gap-2 rounded-[4px] bg-zk-raised px-4 text-[14px] font-medium text-zk-text hover:bg-zk-hover"
              >
                {copied ? <CheckIcon className="h-4 w-4 text-zk-accent" /> : <LinkIcon className="h-4 w-4" />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}
      </main>

      {(expiryNote || (!loading && !error && drawing)) && (
        <footer className="shrink-0 px-6 pb-6 text-center text-[12px] text-zk-muted">
          View-only. Shared drawings are deleted automatically after 30 days.
        </footer>
      )}
    </div>
  );
};

export default ShareViewer;
