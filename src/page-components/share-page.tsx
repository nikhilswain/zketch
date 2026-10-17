import type React from "react";
import ShareViewer from "@/components/share/ShareViewer";
import { useState, useEffect } from "react";

interface SharedDrawing {
  name: string;
  data: string; // base64 image data
  timestamp: number;
}

const SharePage: React.FC = () => {
  const [sharedDrawing, setSharedDrawing] = useState<SharedDrawing | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Parse the shared data from URL
    const urlParams = new URLSearchParams(window.location.search);
    const dataParam = urlParams.get("data");

    if (!dataParam) {
      setError("No shared drawing data found in URL");
      setLoading(false);
      return;
    }

    try {
      const decodedData = atob(decodeURIComponent(dataParam));
      const sharedData: SharedDrawing = JSON.parse(decodedData);
      setSharedDrawing(sharedData);
    } catch (err) {
      console.error("Share parsing error:", err);
      setError(
        `Invalid or corrupted shared drawing data: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <ShareViewer loading={loading} error={error} drawing={sharedDrawing} />
  );
};

export default SharePage;
