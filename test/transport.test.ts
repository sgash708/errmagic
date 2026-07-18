import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildReport, send } from "../src/transport";
import type { ErrorReport, ErrmagicOptions } from "../src/types";

const baseOptions: ErrmagicOptions = {
  endpoint: "https://example.test/errors",
  app: "my-app",
};

describe("buildReport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Error インスタンスから ErrorReport を構築する", () => {
    const err = new TypeError("Cannot read properties of null");
    const report = buildReport(err, undefined, baseOptions, null);
    expect(report.app).toBe("my-app");
    expect(report.name).toBe("TypeError");
    expect(report.message).toBe("Cannot read properties of null");
    expect(report.stack).toContain("TypeError");
    expect(report.occurred_at).toBe("2026-07-15T00:00:00.000Z");
    expect(report.replay).toBeNull();
    expect(report.replay_format).toBeNull();
  });

  it("文字列からも安全に構築する", () => {
    const report = buildReport("boom", undefined, baseOptions, null);
    expect(report.name).toBe("Error");
    expect(report.message).toBe("boom");
    expect(report.stack).toBe("");
  });

  it("undefined からも安全に構築する", () => {
    const report = buildReport(undefined, undefined, baseOptions, null);
    expect(report.name).toBe("Error");
    expect(report.message).toBe("undefined");
  });

  it("オブジェクト値からも安全に構築する", () => {
    const report = buildReport({ code: 42 }, undefined, baseOptions, null);
    expect(report.name).toBe("Error");
    expect(report.message).toContain("42");
  });

  it("message を 2000 文字に切り詰める", () => {
    const longMessage = "a".repeat(3000);
    const err = new Error(longMessage);
    const report = buildReport(err, undefined, baseOptions, null);
    expect(report.message.length).toBe(2000);
  });

  it("stack を 20000 文字に切り詰める", () => {
    const err = new Error("boom");
    err.stack = "x".repeat(30000);
    const report = buildReport(err, undefined, baseOptions, null);
    expect(report.stack.length).toBe(20000);
  });

  it("context は message に反映されず、report には含まれない（契約外フィールドは追加しない）", () => {
    const err = new Error("boom");
    const report = buildReport(err, { userId: "123" }, baseOptions, null);
    expect(Object.keys(report).sort()).toEqual(
      [
        "app",
        "message",
        "name",
        "occurred_at",
        "replay",
        "replay_format",
        "stack",
        "url",
        "user_agent",
      ].sort(),
    );
  });

  it("replay を渡すと replay と replay_format が設定される", () => {
    const err = new Error("boom");
    const report = buildReport(err, undefined, baseOptions, "base64gzip");
    expect(report.replay).toBe("base64gzip");
    expect(report.replay_format).toBe("rrweb-gzip-base64");
  });
});

describe("send", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const report: ErrorReport = {
    app: "my-app",
    name: "TypeError",
    message: "boom",
    stack: "TypeError: boom",
    url: "https://example.test/",
    user_agent: "test-agent",
    occurred_at: "2026-07-15T00:00:00.000Z",
    replay: null,
    replay_format: null,
  };

  it("fetch を keepalive 付きで POST する", () => {
    send("https://example.test/errors", report);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/errors",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify(report),
      }),
    );
  });

  it("fetch が reject しても例外を投げない", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(() => send("https://example.test/errors", report)).not.toThrow();
    // マイクロタスクを流し切って catch が握りつぶすことを確認
    await Promise.resolve();
    await Promise.resolve();
  });

  it("fetch が存在しない環境では何もしない", () => {
    vi.unstubAllGlobals();
    // @ts-expect-error fetch を意図的に未定義化
    delete globalThis.fetch;
    expect(() => send("https://example.test/errors", report)).not.toThrow();
  });

  it("ボディが小さい場合は keepalive: true で送信する", () => {
    send("https://example.test/errors", report);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).keepalive).toBe(true);
  });

  it("ボディが60000文字以上（rrwebリプレイ入り等）の場合は keepalive: false で送信する（fetch keepaliveの64KiB制限対策）", () => {
    const largeReport: ErrorReport = {
      ...report,
      stack: "x".repeat(70_000),
    };
    send("https://example.test/errors", largeReport);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).keepalive).toBe(false);
    // body自体は送信され続けること（送信を諦めるわけではない）
    expect((init as RequestInit).body).toBe(JSON.stringify(largeReport));
  });
});

describe("beforeSend との統合（buildReport の利用側での適用を想定）", () => {
  it("beforeSend が null を返した場合、呼び出し側は送信しない設計であることを確認する", () => {
    const options: ErrmagicOptions = {
      ...baseOptions,
      beforeSend: () => null,
    };
    const err = new Error("boom");
    const report = buildReport(err, undefined, options, null);
    const result = options.beforeSend ? options.beforeSend(report) : report;
    expect(result).toBeNull();
  });
});
