"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { observer } from "mobx-react-lite";
import CanvasView from "@/components/canvas-view";
import MobileDrawingApp from "@/components/mobile-drawing-app";

const DrawPage: React.FC = observer(() => {
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

  const handleBackToVault = () => {
    window.location.href = "/";
  };

  // Use mobile app for small screens
  if (isMobile) {
    return <MobileDrawingApp />;
  }

  return (
    <CanvasView editingDrawingId={null} onBackToVault={handleBackToVault} />
  );
});

export default DrawPage;
