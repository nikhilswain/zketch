import type React from "react";
import { observer } from "mobx-react-lite";
import VaultView from "@/components/valut-view";

const VaultPage: React.FC = observer(() => {
  const handleNewDrawing = () => {
    window.location.href = "/draw";
  };

  const handleEditDrawing = (drawingId: string) => {
    window.location.href = `/draw/${drawingId}`;
  };

  return (
    <VaultView
      onNewDrawing={handleNewDrawing}
      onEditDrawing={handleEditDrawing}
    />
  );
});

export default VaultPage;
