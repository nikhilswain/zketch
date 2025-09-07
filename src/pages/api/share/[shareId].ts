import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const shareId = params.shareId;

    if (!shareId || typeof shareId !== "string") {
      return new Response(JSON.stringify({ error: "Invalid share ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

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

    // Retrieve the shared drawing data
    const shareDataJson = await KV.get(shareId);

    if (!shareDataJson) {
      return new Response(
        JSON.stringify({
          error: "Shared drawing not found",
          message:
            "This shared drawing may have expired or the link is invalid.",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const shareData = JSON.parse(shareDataJson);

    return new Response(
      JSON.stringify({
        success: true,
        data: shareData,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        },
      }
    );
  } catch (error) {
    console.error("Error retrieving share data:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to retrieve share data",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
