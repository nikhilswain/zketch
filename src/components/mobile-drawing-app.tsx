import type React from "react";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useVaultStore } from "../hooks/useStores";
import VaultView from "./valut-view";
import MobileCanvasView from "./mobile-canvas-view";

const MobileDrawingApp: React.FC = observer(() => {
  const vaultStore = useVaultStore();
  const [currentView, setCurrentView] = useState<"vault" | "canvas">("vault");
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);

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

  if (currentView === "vault") {
    return (
      <VaultView
        onNewDrawing={handleNewDrawing}
        onEditDrawing={handleEditDrawing}
      />
    );
  }

  return (
    <MobileCanvasView
      editingDrawingId={editingDrawingId}
      onBackToVault={handleBackToVault}
    />
  );
});

export default MobileDrawingApp;
