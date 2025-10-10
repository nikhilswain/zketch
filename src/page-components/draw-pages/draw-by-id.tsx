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
    window.location.href = "/";
  };

  // Loading state
  if (drawingExists === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading drawing...</div>
      </div>
    );
  }

  // Drawing not found
  if (!drawingExists) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold">Drawing not found</h1>
        <p className="text-muted-foreground">
          The drawing with ID "{drawingId}" could not be found in your local
          vault.
        </p>
        <button
          onClick={handleBackToVault}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Back to Vault
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
