import type React from "react";
import { useState, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useVaultStore } from "@/hooks/useStores";
import CanvasView from "@/components/canvas-view";
import { useIsMobile } from "@/hooks/useMobile";

const DrawByIdPage: React.FC = observer(() => {
  const vaultStore = useVaultStore();
  const [drawingExists, setDrawingExists] = useState<boolean | null>(null);

  const isMobile = useIsMobile();

  const drawingId =
    new URLSearchParams(window.location.search).get("id") ||
    window.location.pathname.split("/").pop() ||
    "";

  // Check if drawing exists in local database
  useEffect(() => {
    const checkDrawingExists = async () => {
      if (!drawingId) {
        setDrawingExists(false);
        return;
      }

      try {
        // Wait for vault store to be ready
        if (vaultStore.isLoading) {
          return; // Wait for loading to complete
        }

        const drawing = await vaultStore.getDrawingById(drawingId);
        setDrawingExists(!!drawing);
      } catch (error) {
        console.error("Error checking drawing existence:", error);
        setDrawingExists(false);
      }
    };

    checkDrawingExists();
  }, [drawingId, vaultStore, vaultStore.isLoading]);

  const handleBackToVault = () => {
    window.location.href = "/vault";
  };

  if (drawingExists === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zk-surface font-ui text-[13px] text-zk-muted">
        Opening drawing…
      </div>
    );
  }

  if (!drawingExists) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zk-surface px-6 text-center font-ui text-zk-text">
        <h1 className="font-display text-[32px] font-semibold">Drawing not found</h1>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-zk-muted">
          It isn’t in the vault on this device. Drawings are saved only in the browser they were made in.
        </p>
        <button
          onClick={handleBackToVault}
          className="mt-6 h-10 rounded-[4px] bg-zk-accent px-5 text-[14px] font-semibold text-zk-on-accent hover:brightness-110"
        >
          Back to your drawings
        </button>
      </div>
    );
  }

  // Use mobile app for small screens
  if (isMobile) {
    window.location.href = "/";
  }

  return (
    <CanvasView
      editingDrawingId={drawingId}
      onBackToVault={handleBackToVault}
    />
  );
});

export default DrawByIdPage;
