import type React from "react";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import VaultView from "@/components/valut-view";
import NewDrawingDialog from "@/components/NewDrawingDialog";
import { useIsMobile } from "@/hooks/useMobile";
import { pageParam } from "@/utils/page";
import { flushAll } from "@/utils/pendingDelete";
import NoMobile from "./no-mobile";

const VaultPage: React.FC = observer(() => {
  const isMobile = useIsMobile();
  const [newOpen, setNewOpen] = useState(false);

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
