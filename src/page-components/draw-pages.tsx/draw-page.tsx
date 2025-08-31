"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { observer } from "mobx-react-lite";
import CanvasView from "@/components/canvas-view";
import MobileDrawingApp from "@/components/mobile-drawing-app";
import { useIsMobile } from "@/hooks/useMobile";

const DrawPage: React.FC = observer(() => {
  const isMobile = useIsMobile();

  const handleBackToVault = () => {
    window.location.href = "/";
  };

  if (isMobile) {
    handleBackToVault();
  }

  return (
    <CanvasView editingDrawingId={null} onBackToVault={handleBackToVault} />
  );
});

export default DrawPage;
