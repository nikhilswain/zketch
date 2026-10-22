import { describe, expect, it } from "vitest";
import { embedSize, embedUrl, iframeCode, pictureHtml, pictureMarkdown } from "../src/share/embedCode";

const base = { origin: "https://zketch.zerro.dev", id: "aB3dE5fG7hJ9", name: "Cosy house" };
const aspect = { width: 1200, height: 900 };

describe("embedSize", () => {
  it("adds the strip for playable modes", () => {
    expect(embedSize(aspect, "tap")).toEqual({ width: 640, height: 504 });
    expect(embedSize(aspect, "auto")).toEqual({ width: 640, height: 504 });
    expect(embedSize(aspect, "picture")).toEqual({ width: 640, height: 480 });
  });

  it("falls back to 4:3 without a preview size", () => {
    expect(embedSize({ width: 0, height: 0 }, "picture")).toEqual({ width: 640, height: 480 });
  });
});

describe("iframeCode", () => {
  it("tap to play is the bare embed url", () => {
    expect(iframeCode({ ...base, mode: "tap", loop: false, aspect })).toBe(
      '<iframe src="https://zketch.zerro.dev/embed/aB3dE5fG7hJ9" title="Cosy house — drawn in zketch" style="width:100%;aspect-ratio:640/504;border:0;border-radius:8px" loading="lazy"></iframe>',
    );
  });

  it("adds mode and loop", () => {
    expect(embedUrl({ ...base, mode: "auto", loop: true })).toBe(
      "https://zketch.zerro.dev/embed/aB3dE5fG7hJ9?mode=auto&loop=1",
    );
    expect(embedUrl({ ...base, mode: "auto", loop: false })).toBe(
      "https://zketch.zerro.dev/embed/aB3dE5fG7hJ9?mode=auto",
    );
    expect(embedUrl({ ...base, mode: "tap", loop: true })).toBe("https://zketch.zerro.dev/embed/aB3dE5fG7hJ9");
    const code = iframeCode({ ...base, mode: "picture", loop: true, aspect });
    expect(code).toContain('src="https://zketch.zerro.dev/embed/aB3dE5fG7hJ9?mode=picture"');
    expect(code).toContain("aspect-ratio:640/480");
  });

  it("escapes the name", () => {
    const code = iframeCode({ ...base, name: `"Tom" & <Jerry>`, mode: "tap", loop: false, aspect });
    expect(code).toContain('title="&quot;Tom&quot; &amp; &lt;Jerry&gt; — drawn in zketch"');
  });
});

describe("picture codes", () => {
  it("html links the picture to the share page", () => {
    expect(pictureHtml(base)).toBe(
      '<a href="https://zketch.zerro.dev/share/aB3dE5fG7hJ9"><img src="https://zketch.zerro.dev/api/shares/aB3dE5fG7hJ9/picture.png" alt="Cosy house — drawn in zketch" width="640"></a>',
    );
  });

  it("markdown escapes brackets and parentheses", () => {
    expect(pictureMarkdown(base)).toBe(
      "[![Cosy house — drawn in zketch](https://zketch.zerro.dev/api/shares/aB3dE5fG7hJ9/picture.png)](https://zketch.zerro.dev/share/aB3dE5fG7hJ9)",
    );
    expect(pictureMarkdown({ ...base, name: "a] (b)" })).toContain("[![a\\] \\(b\\) — drawn in zketch]");
  });
});
