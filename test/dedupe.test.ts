import { describe, expect, it } from "vitest";
import { Deduper } from "../src/dedupe";

describe("Deduper", () => {
  it("初回のキーは true を返す", () => {
    const deduper = new Deduper(300_000);
    expect(deduper.shouldReport("key-a", 0)).toBe(true);
  });

  it("窓内での同一キーは false を返す", () => {
    const deduper = new Deduper(300_000);
    expect(deduper.shouldReport("key-a", 0)).toBe(true);
    expect(deduper.shouldReport("key-a", 1_000)).toBe(false);
    expect(deduper.shouldReport("key-a", 299_999)).toBe(false);
  });

  it("窓を超えた同一キーは再度 true を返す", () => {
    const deduper = new Deduper(300_000);
    expect(deduper.shouldReport("key-a", 0)).toBe(true);
    expect(deduper.shouldReport("key-a", 300_000)).toBe(true);
  });

  it("異なるキーは独立してデデュープされる", () => {
    const deduper = new Deduper(300_000);
    expect(deduper.shouldReport("key-a", 0)).toBe(true);
    expect(deduper.shouldReport("key-b", 0)).toBe(true);
  });

  it("now を省略すると Date.now() を使う", () => {
    const deduper = new Deduper(300_000);
    expect(deduper.shouldReport("key-a")).toBe(true);
    expect(deduper.shouldReport("key-a")).toBe(false);
  });
});
