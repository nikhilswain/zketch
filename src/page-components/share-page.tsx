import type React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Home, Share2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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

  const handleDownload = () => {
    if (!sharedDrawing) return;

    const link = document.createElement("a");
    link.href = sharedDrawing.data;
    link.download = `${sharedDrawing.name
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Drawing downloaded!");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg text-gray-600">Loading shared drawing...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Unable to Load Drawing
            </h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button
              onClick={() => (window.location.href = "/")}
              className="w-full"
            >
              <Home className="w-4 h-4 mr-2" />
              Go to ZKetch
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Shared Drawing
          </h1>
          <p className="text-gray-600">
            Someone shared this drawing with you using ZKetch
          </p>
        </div>

        {/* Drawing Card */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="text-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                {sharedDrawing?.name || "Untitled Drawing"}
              </h2>
              {sharedDrawing?.timestamp && (
                <p className="text-sm text-gray-500">
                  Shared on {formatDate(sharedDrawing.timestamp)}
                </p>
              )}
            </div>

            {/* Drawing Image */}
            <div className="flex justify-center mb-6">
              <div className="bg-white rounded-lg shadow-sm border p-4 max-w-full">
                {sharedDrawing?.data && (
                  <img
                    src={sharedDrawing.data}
                    alt={sharedDrawing.name}
                    className="max-w-full max-h-[60vh] object-contain rounded"
                  />
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={handleDownload}
                className="flex items-center gap-2"
                size="lg"
              >
                <Download className="w-4 h-4" />
                Download Image
              </Button>

              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="flex items-center gap-2"
                size="lg"
              >
                <Share2 className="w-4 h-4" />
                Copy Share Link
              </Button>

              <Button
                onClick={() =>
                  (window.location.href = "https://zketch.pages.dev")
                }
                variant="outline"
                className="flex items-center gap-2"
                size="lg"
              >
                <Home className="w-4 h-4" />
                Create Your Own
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          <p>
            Created with{" "}
            <a
              href="https://zketch.pages.dev"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              ZKetch
            </a>{" "}
            - A free digital drawing app
          </p>
        </div>
      </div>
    </div>
  );
};

export default SharePage;
