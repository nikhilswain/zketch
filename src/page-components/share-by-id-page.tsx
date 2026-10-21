import type React from "react";
import ShareViewer from "@/components/share/ShareViewer";
import { useState, useEffect } from "react";
import { ShareService, type ShareData } from "@/services/ShareService";

const SHARE_ID = /^[A-Za-z0-9]{12}$/;

interface ShareByIdPageProps {
  shareId: string;
}

const ShareByIdPage: React.FC<ShareByIdPageProps> = ({ shareId }) => {
  const [sharedDrawing, setSharedDrawing] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError("Invalid share link");
      setLoading(false);
      return;
    }

    loadSharedDrawing();
  }, [shareId]);

  const loadSharedDrawing = async () => {
    try {
      setLoading(true);
      const response = await ShareService.retrieveSharedDrawing(shareId);

      if (response.success && response.data) {
        setSharedDrawing(response.data);
      } else {
        setError(
          response.message || response.error || "Failed to load shared drawing"
        );
      }
    } catch (err) {
      console.error("Failed to load shared drawing:", err);
      setError("This shared drawing may have expired or the link is invalid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ShareViewer
      loading={loading}
      error={error}
      drawing={sharedDrawing}
      onRetry={loadSharedDrawing}
      expiryNote={!SHARE_ID.test(shareId)}
    />
  );
};

export default ShareByIdPage;
