import type React from "react";
import { observer } from "mobx-react-lite";
import VaultView from "@/components/valut-view";
import { useIsMobile } from "@/hooks/useMobile";
import NoMobile from "./no-mobile";

const VaultPage: React.FC = observer(() => {
  const isMobile = useIsMobile();

  const handleNewDrawing = () => {
    window.location.href = "/draw";
  };

  const handleEditDrawing = (drawingId: string) => {
    window.location.href = `/draw/${drawingId}`;
  };

  return (
    <>
      {isMobile ? (
        <NoMobile />
      ) : (
        <VaultView
          onNewDrawing={handleNewDrawing}
          onEditDrawing={handleEditDrawing}
        />
      )}
    </>
  );
});

export default VaultPage;
