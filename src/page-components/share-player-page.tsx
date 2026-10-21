import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ZketchMark from "@/components/ZketchMark";
import SharePlayer, { stageSize, type SharePlayerHandle } from "@/components/share/SharePlayer";
import { CloseIcon, DownloadIcon, LoaderIcon, PencilIcon } from "@/components/icons";
import { useIsMobile } from "@/hooks/useMobile";
import type { ISavedDrawingData } from "@/models/VaultModel";
import { parseBackup } from "@/services/BackupService";
import { importAsNewDrawing } from "@/services/VaultBackup";
import { buildReplay } from "@/share/replay";
import type { ShareMeta } from "@/share/shareServer";

interface SharePlayerPageProps {
  meta: ShareMeta;
}

type Loaded = { drawing: ISavedDrawingData; blobs: Map<string, Blob>; text: string };

function fileBase(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "").trim() || "drawing";
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SharePlayerPage: React.FC<SharePlayerPageProps> = ({ meta }) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const videoAbort = useRef<AbortController | null>(null);
  const playerRef = useRef<SharePlayerHandle>(null);
  const isMobile = useIsMobile();
  const pictureUrl = `/api/shares/${meta.id}/picture.png`;

  const load = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/shares/${meta.id}`);
      if (!response.ok) throw new Error("The drawing couldn't be found.");
      const text = await response.text();
      const backup = parseBackup(text);
      const drawing = backup.drawings[0];
      if (!drawing) throw new Error("The drawing couldn't be found.");
      setLoaded({ drawing, blobs: new Map(backup.blobs.map((b) => [b.id, b.blob])), text });
    } catch (err) {
      console.error("Failed to load shared drawing:", err);
      setError(err instanceof Error ? err.message : "The drawing couldn't be found.");
    }
  };

  useEffect(() => {
    load();
  }, [meta.id]);

  useEffect(() => () => videoAbort.current?.abort(), []);

  const watchable = useMemo(() => (loaded ? buildReplay(loaded.drawing.layers).total > 0 : false), [loaded]);

  const makeVideo = async () => {
    if (!loaded || videoAbort.current) return;
    const controller = new AbortController();
    videoAbort.current = controller;
    setVideoProgress(0);
    try {
      const { makeReplayVideo } = await import("@/share/video");
      const { blob, ext } = await makeReplayVideo({
        drawing: loaded.drawing,
        blobs: loaded.blobs,
        speed: playerRef.current?.getSpeed() ?? 1,
        onProgress: (p) => {
          if (!controller.signal.aborted) setVideoProgress(p);
        },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) saveBlob(blob, `${fileBase(meta.name)}.${ext}`);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error("Failed to make the video:", err);
        toast.error("Couldn't make the video");
      }
    } finally {
      if (videoAbort.current === controller) {
        videoAbort.current = null;
        setVideoProgress(null);
      }
    }
  };

  const cancelVideo = () => {
    videoAbort.current?.abort();
    videoAbort.current = null;
    setVideoProgress(null);
  };

  const continueDrawing = async () => {
    if (!loaded || continuing) return;
    setContinuing(true);
    try {
      const id = await importAsNewDrawing(loaded.text);
      window.location.href = `/draw/${id}`;
    } catch (err) {
      console.error("Failed to continue the drawing:", err);
      toast.error("Couldn't copy the drawing into your vault");
      setContinuing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zk-surface font-ui text-zk-text">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zk-hairline px-6 sm:px-10">
        <a href="/" className="zk-logo-hover flex items-center gap-2.5" aria-label="Zketch home">
          <ZketchMark size={32} />
          <span className="font-display text-[20px] font-semibold text-zk-text">Zketch</span>
        </a>
        <a
          href="/draw"
          className="flex h-9 items-center rounded-[4px] bg-zk-accent px-4 text-[14px] font-semibold text-zk-on-accent hover:brightness-110"
        >
          Make your own
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        {error ? (
          <div className="max-w-md text-center">
            <h1 className="font-display text-[32px] font-semibold">This link doesn’t open</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-zk-muted">{error}</p>
            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={load}
                className="h-10 rounded-[4px] bg-zk-raised px-4 text-[14px] font-medium text-zk-text hover:bg-zk-hover"
              >
                Try again
              </button>
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
              <h1 className="font-display text-[36px] leading-tight font-semibold">{meta.name}</h1>
              {meta.createdAt > 0 && (
                <p className="mt-2 text-[13px] text-zk-muted">
                  Shared{" "}
                  {new Date(meta.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
            {loaded ? (
              <SharePlayer
                ref={playerRef}
                drawing={loaded.drawing}
                blobs={loaded.blobs}
                pictureUrl={pictureUrl}
                name={meta.name}
              />
            ) : (
              <div
                className="relative overflow-hidden rounded-[4px] bg-white shadow-(--zk-shadow-share)"
                style={stageSize(meta.previewWidth || 4, meta.previewHeight || 3)}
              >
                <img src={pictureUrl} alt={meta.name} draggable={false} className="absolute inset-0 h-full w-full" />
              </div>
            )}
            <div className="mt-3 flex w-full max-w-[640px] items-center justify-between gap-4 text-[14px]">
              <span className="font-['Kalam',cursive] text-zk-muted">
                {watchable ? "tap to watch · drag across to scrub" : ""}
              </span>
              <a
                href="/draw"
                className="font-semibold text-zk-text decoration-zk-accent decoration-2 underline-offset-4 hover:underline"
              >
                draw your own →
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <a
                href={pictureUrl}
                download={`${fileBase(meta.name)}.png`}
                className="flex h-10 items-center gap-2 rounded-[4px] bg-zk-accent px-5 text-[14px] font-semibold text-zk-on-accent hover:brightness-110"
              >
                <DownloadIcon className="h-4 w-4" />
                Picture
              </a>
              {videoProgress === null ? (
                <button
                  onClick={makeVideo}
                  disabled={!loaded || !watchable}
                  className="flex h-10 items-center gap-2 rounded-[4px] bg-zk-raised px-4 text-[14px] font-medium text-zk-text hover:bg-zk-hover disabled:cursor-default disabled:text-zk-disabled disabled:hover:bg-zk-raised"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Video
                </button>
              ) : (
                <div className="flex h-10 items-center rounded-[4px] bg-zk-raised text-[14px] font-medium text-zk-text">
                  <span className="flex items-center gap-2 pr-2 pl-4 tabular-nums" role="status">
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                    Making video… {Math.round(videoProgress * 100)}%
                  </span>
                  <button
                    onClick={cancelVideo}
                    aria-label="Cancel video"
                    className="flex h-10 w-9 items-center justify-center rounded-r-[4px] text-zk-muted hover:bg-zk-hover hover:text-zk-text"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
              {meta.allowContinue &&
                (isMobile ? (
                  <span className="px-2 text-[13px] text-zk-muted">Open on a computer to continue it</span>
                ) : (
                  <button
                    onClick={continueDrawing}
                    disabled={!loaded || continuing}
                    className="flex h-10 items-center gap-2 rounded-[4px] bg-zk-raised px-4 text-[14px] font-medium text-zk-text hover:bg-zk-hover disabled:cursor-default disabled:opacity-60"
                  >
                    {continuing ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <PencilIcon className="h-4 w-4" />}
                    Continue in zketch
                  </button>
                ))}
            </div>
          </div>
        )}
      </main>

      {!meta.allowContinue && (
        <footer className="shrink-0 px-6 pb-6 text-center text-[12px] text-zk-muted">View-only link.</footer>
      )}
    </div>
  );
};

export default SharePlayerPage;
