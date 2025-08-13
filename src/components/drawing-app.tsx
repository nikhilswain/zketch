import type React from "react";
import { useState, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useVaultStore } from "@/hooks/useStores";
import VaultView from "./valut-view";
import CanvasView from "./canvas-view";
import MobileDrawingApp from "./mobile-drawing-app";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

const DrawingApp: React.FC = observer(() => {
  const vaultStore = useVaultStore();
  const [currentView, setCurrentView] = useState<"vault" | "canvas">("vault");
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleNewDrawing = () => {
    setEditingDrawingId(null);
    setCurrentView("canvas");
  };

  const handleEditDrawing = (drawingId: string) => {
    setEditingDrawingId(drawingId);
    setCurrentView("canvas");
  };

  const handleBackToVault = () => {
    setCurrentView("vault");
    setEditingDrawingId(null);
  };

  const handleToggleVault = () => {
    if (currentView === "vault") {
      handleNewDrawing();
    } else {
      handleBackToVault();
    }
  };

  useKeyboardShortcuts(
    undefined, // save handled in CanvasView
    undefined, // export handled in CanvasView
    undefined, // sidebar toggle handled in CanvasView
    handleToggleVault // vault toggle
  );

  // Use mobile app for small screens
  if (isMobile) {
    return <MobileDrawingApp />;
  }

  if (currentView === "vault") {
    return (
      <VaultView
        onNewDrawing={handleNewDrawing}
        onEditDrawing={handleEditDrawing}
      />
    );
  }

  return (
    <CanvasView
      editingDrawingId={editingDrawingId}
      onBackToVault={handleBackToVault}
    />
  );
});

export default DrawingApp;
