import { describe, it, expect } from "vitest";
import { b2Bucket } from "../src/share/b2Bucket";

const CFG = {
  endpoint: "s3.us-west-004.backblazeb2.com",
  keyId: "004abc",
  appKey: "K004secret",
  bucket: "zketch-shares",
};
const URL_BASE = "https://s3.us-west-004.backblazeb2.com/zketch-shares/shares/abc";

function fakeS3() {
  const objects = new Map<string, { data: ArrayBuffer; headers: Headers }>();
  const requests: Request[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    const key = new URL(request.url).pathname;
    const stored = objects.get(key);
    if (request.method === "PUT") {
      const headers = new Headers();
      const type = request.headers.get("content-type");
      if (type) headers.set("content-type", type);
      const meta = request.headers.get("x-amz-meta-zk");
      if (meta) headers.set("x-amz-meta-zk", meta);
      objects.set(key, { data: await request.arrayBuffer(), headers });
      return new Response(null, { status: 200 });
    }
    if (request.method === "DELETE") {
      if (!stored) return new Response("missing", { status: 404 });
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    if (!stored) return new Response(null, { status: 404 });
    return new Response(request.method === "HEAD" ? null : stored.data, {
      status: 200,
      headers: stored.headers,
    });
  }) as typeof fetch;
  return { objects, requests, fetchFn };
}

const META = {
  version: "1",
  name: "Chat noir — été 🐈",
  allowContinue: "1",
  previewWidth: "800",
  previewHeight: "600",
  createdAt: "1761100000000",
  deleteKeyHash: "ab".repeat(32),
};

describe("b2Bucket", () => {
  it("put signs a path-style PUT with one encoded metadata header", async () => {
    const { requests, fetchFn } = fakeS3();
    const bucket = b2Bucket({ ...CFG, endpoint: `https://${CFG.endpoint}/` }, fetchFn);
    await bucket.put("shares/abc/drawing.zketch", new Blob(["hello"]), {
      httpMetadata: { contentType: "application/gzip" },
      customMetadata: META,
    });
    expect(requests).toHaveLength(1);
    const put = requests[0];
    expect(put.method).toBe("PUT");
    expect(put.url).toBe(`${URL_BASE}/drawing.zketch`);
    const auth = put.headers.get("authorization") ?? "";
    expect(auth.startsWith("AWS4-HMAC-SHA256")).toBe(true);
    expect(auth).toContain("/us-west-004/s3/aws4_request");
    expect(auth).toContain("Credential=004abc/");
    expect(put.headers.get("content-type")).toBe("application/gzip");
    expect(put.headers.get("x-amz-meta-zk")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("get and head decode the metadata back exactly", async () => {
    const { fetchFn } = fakeS3();
    const bucket = b2Bucket(CFG, fetchFn);
    await bucket.put("shares/abc/drawing.zketch", new Blob(["payload"]), {
      httpMetadata: { contentType: "application/json" },
      customMetadata: META,
    });
    const got = await bucket.get("shares/abc/drawing.zketch");
    expect(got?.customMetadata).toEqual(META);
    expect(got?.httpMetadata?.contentType).toBe("application/json");
    expect(await new Response(got!.body!).text()).toBe("payload");
    const head = await bucket.head("shares/abc/drawing.zketch");
    expect(head?.customMetadata).toEqual(META);
    expect(head?.httpMetadata?.contentType).toBe("application/json");
  });

  it("missing objects are null", async () => {
    const { fetchFn } = fakeS3();
    const bucket = b2Bucket(CFG, fetchFn);
    expect(await bucket.get("shares/abc/picture.png")).toBeNull();
    expect(await bucket.head("shares/abc/picture.png")).toBeNull();
  });

  it("delete sends one DELETE per key and tolerates missing ones", async () => {
    const { objects, requests, fetchFn } = fakeS3();
    const bucket = b2Bucket(CFG, fetchFn);
    await bucket.put("shares/abc/picture.png", new Blob(["p"]), {
      httpMetadata: { contentType: "image/png" },
    });
    requests.length = 0;
    await bucket.delete(["shares/abc/picture.png", "shares/abc/preview.jpg"]);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `DELETE ${URL_BASE}/picture.png`,
      `DELETE ${URL_BASE}/preview.jpg`,
    ]);
    expect(objects.size).toBe(0);
  });

  it("throws on server errors", async () => {
    const fetchFn = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const bucket = b2Bucket(CFG, fetchFn);
    await expect(bucket.put("shares/abc/picture.png", new Blob(["p"]))).rejects.toThrow();
    await expect(bucket.get("shares/abc/picture.png")).rejects.toThrow();
    await expect(bucket.delete(["shares/abc/picture.png"])).rejects.toThrow();
  });
});
