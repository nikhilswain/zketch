import type React from "react";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { when } from "mobx";
import { toast } from "sonner";
import VaultView from "@/components/valut-view";
import NewDrawingDialog from "@/components/NewDrawingDialog";
import { useIsMobile } from "@/hooks/useMobile";
import { pageParam } from "@/utils/page";
import { flushAll } from "@/utils/pendingDelete";
import { useVaultStore } from "@/hooks/useStores";
import { importBackupFile, keepStorage } from "@/services/VaultBackup";
import { parseBackup } from "@/services/BackupService";
import NoMobile from "./no-mobile";

const VaultPage: React.FC = observer(() => {
  const isMobile = useIsMobile();
  const vaultStore = useVaultStore();
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    const queue = (window as Window & { launchQueue?: LaunchQueue }).launchQueue;
    if (!queue) return;
    queue.setConsumer(async (params) => {
      if (!params.files?.length) return;
      if ((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload") return;
      const files = await Promise.all(params.files.map((handle) => handle.getFile()));
      await when(() => vaultStore.hasLoaded && !vaultStore.isLoading);
      await flushAll();
      let added = 0;
      let skipped = 0;
      let open: string | null = null;
      for (const file of files) {
        try {
          const result = await importBackupFile(file);
          added += result.added.length;
          skipped += result.skipped;
          if (files.length === 1 && result.added.length === 1) open = result.added[0].id;
          if (files.length === 1 && !result.added.length && result.skipped === 1) {
            const only = parseBackup(await file.text()).drawings;
            if (only.length === 1) open = only[0].id;
          }
        } catch (error) {
          toast.error(`Couldn't open “${file.name}”`, { description: error instanceof Error ? error.message : undefined });
        }
      }
      if (added > 0) {
        await vaultStore.loadFromDB();
        await vaultStore.updateStorageInfo();
        void keepStorage();
      }
      if (open) {
        window.location.href = `/draw/${open}`;
        return;
      }
      if (added > 0) toast.success(`Imported ${added} ${added === 1 ? "drawing" : "drawings"}`);
      else if (skipped > 0) toast(`${skipped === 1 ? "That drawing is" : "Those drawings are"} already here`);
    });
  }, [vaultStore]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setNewOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleCreate = async (size: { width: number; height: number } | null) => {
    await flushAll();
    window.location.href = size ? `/draw?page=${pageParam(size.width, size.height)}` : "/draw";
  };

  const handleEditDrawing = async (drawingId: string) => {
    await flushAll();
    window.location.href = `/draw/${drawingId}`;
  };

  return (
    <>
      {isMobile ? (
        <NoMobile />
      ) : (
        <>
          <VaultView onNewDrawing={() => setNewOpen(true)} onEditDrawing={handleEditDrawing} />
          <NewDrawingDialog open={newOpen} onOpenChange={setNewOpen} onCreate={handleCreate} />
        </>
      )}
    </>
  );
});

export default VaultPage;
