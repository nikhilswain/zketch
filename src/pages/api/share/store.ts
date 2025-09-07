import type { APIRoute } from "astro";

interface ShareData {
  name: string;
  data: string; // base64 image data
  timestamp: number;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get the KV namespace from the Cloudflare runtime
    // @ts-ignore - Cloudflare runtime types
    const KV = locals.runtime?.env?.ZKETCH_SHARES as KVNamespace;

    if (!KV) {
      return new Response(
        JSON.stringify({ error: "KV storage not available" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const shareData: ShareData = await request.json();

    // Validate data
    if (!shareData.name || !shareData.data || !shareData.timestamp) {
      return new Response(JSON.stringify({ error: "Invalid share data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check size limit (25MB for free plan, but let's be conservative with 20MB)
    const dataSize = JSON.stringify(shareData).length;
    const maxSize = 20 * 1024 * 1024; // 20MB

    if (dataSize > maxSize) {
      return new Response(
        JSON.stringify({
          error: "Drawing too large to share",
          message:
            "Your drawing exceeds the 20MB sharing limit. Try reducing the complexity or export as a file instead.",
          size: dataSize,
          maxSize: maxSize,
        }),
        {
          status: 413,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Generate a unique ID for the shared drawing
    const shareId = generateShareId();

    // Store in KV with TTL (30 days = 2592000 seconds)
    await KV.put(shareId, JSON.stringify(shareData), {
      expirationTtl: 2592000, // 30 days
    });

    return new Response(
      JSON.stringify({
        success: true,
        shareId: shareId,
        shareUrl: `${new URL(request.url).origin}/share/${shareId}`,
        expiresAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error storing share data:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to store share data",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

function generateShareId(): string {
  // Generate a cryptographically random ID
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomArray = new Uint8Array(12);

  // Use crypto.getRandomValues if available, fallback to Math.random
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(randomArray);
    for (let i = 0; i < randomArray.length; i++) {
      result += chars[randomArray[i] % chars.length];
    }
  } else {
    // Fallback for environments without crypto.getRandomValues
    for (let i = 0; i < 12; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }

  return result;
}
