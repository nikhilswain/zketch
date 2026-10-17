"use client";

import type React from "react";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import CanvasView from "@/components/canvas-view";
import { useIsMobile } from "@/hooks/useMobile";
import { parsePageParam } from "@/utils/page";

const DrawPage: React.FC = observer(() => {
  const isMobile = useIsMobile();
  const [newPageSize] = useState(() =>
    typeof window === "undefined" ? null : parsePageParam(new URLSearchParams(window.location.search).get("page")),
  );

  const handleBackToVault = () => {
    window.location.href = "/";
  };

  if (isMobile) {
    handleBackToVault();
  }

  return (
    <CanvasView editingDrawingId={null} newPageSize={newPageSize} onBackToVault={handleBackToVault} />
  );
});

export default DrawPage;
