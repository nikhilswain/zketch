import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, flushAll, schedule, undo } from "../src/utils/pendingDelete";

describe("pending delete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await flushAll();
    vi.useRealTimers();
  });

  it("runs after the delay", () => {
    const run = vi.fn();
    schedule("a", run, 6000);
    vi.advanceTimersByTime(5999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("undo cancels it", () => {
    const run = vi.fn();
    schedule("a", run, 6000);
    expect(undo("a")).toBe(true);
    vi.advanceTimersByTime(10000);
    expect(run).not.toHaveBeenCalled();
    expect(undo("a")).toBe(false);
  });

  it("flushAll runs every pending one right away, and only once", async () => {
    const a = vi.fn();
    const b = vi.fn();
    schedule("a", a, 6000);
    schedule("b", b, 6000);
    await flushAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    await flushAll();
    vi.advanceTimersByTime(10000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("flush runs one early and the timer does not run it again", async () => {
    const run = vi.fn();
    schedule("a", run, 6000);
    await flush("a");
    vi.advanceTimersByTime(10000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a ran delete cannot be undone", () => {
    const run = vi.fn();
    schedule("a", run, 6000);
    vi.advanceTimersByTime(6000);
    expect(undo("a")).toBe(false);
  });
});
