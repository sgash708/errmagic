import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recorderMocks = vi.hoisted(() => ({
  startRecorder: vi.fn(),
  stopRecorder: vi.fn(),
  takeReplay: vi.fn().mockResolvedValue(null),
  hasAttachedFor: vi.fn().mockReturnValue(false),
  markAttached: vi.fn(),
}));

vi.mock("../src/recorder", () => recorderMocks);

import { __resetForTest, initErrmagic, reportError } from "../src/index";

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("initErrmagic / reportError", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetForTest();
    Object.values(recorderMocks).forEach((m) => m.mockClear());
    recorderMocks.takeReplay.mockResolvedValue(null);
    recorderMocks.hasAttachedFor.mockReturnValue(false);
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    __resetForTest();
    vi.unstubAllGlobals();
  });

  it("reportErrorで手動報告するとfetchが呼ばれる", async () => {
    initErrmagic({ endpoint: "https://example.test/errors", app: "my-app" });
    reportError(new Error("boom"));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/errors");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.app).toBe("my-app");
    expect(body.name).toBe("Error");
    expect(body.message).toBe("boom");
  });

  it("init前のreportErrorは何もしない", async () => {
    reportError(new Error("boom"));
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("同一エラーを連投しても5分以内は1回しか送信しない", async () => {
    initErrmagic({ endpoint: "https://example.test/errors", app: "my-app" });
    reportError(new Error("boom"));
    await flushMicrotasks();
    reportError(new Error("boom"));
    await flushMicrotasks();
    reportError(new Error("boom"));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("beforeSendがnullを返すと送信されない", async () => {
    initErrmagic({
      endpoint: "https://example.test/errors",
      app: "my-app",
      beforeSend: () => null,
    });
    reportError(new Error("boom"));
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("beforeSendが加工したレポートを返すとそれが送信される", async () => {
    initErrmagic({
      endpoint: "https://example.test/errors",
      app: "my-app",
      beforeSend: (report) => ({ ...report, message: "REDACTED" }),
    });
    reportError(new Error("secret-token-xyz"));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.message).toBe("REDACTED");
  });

  it("二重initは後勝ちでエンドポイントが上書きされる", async () => {
    initErrmagic({ endpoint: "https://old.test/errors", app: "my-app" });
    initErrmagic({ endpoint: "https://new.test/errors", app: "my-app" });
    reportError(new Error("boom"));
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://new.test/errors");
  });

  it("window.onerrorを既存ハンドラを連鎖しつつフックする", async () => {
    const existing = vi.fn().mockReturnValue(true);
    window.onerror = existing;
    initErrmagic({ endpoint: "https://example.test/errors", app: "my-app" });

    const err = new TypeError("global boom");
    const result = window.onerror!("global boom", "app.js", 1, 2, err);

    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(existing).toHaveBeenCalledWith("global boom", "app.js", 1, 2, err);
    expect(result).toBe(true);
  });

  it("unhandledrejectionイベントを捕捉して送信する", async () => {
    initErrmagic({ endpoint: "https://example.test/errors", app: "my-app" });

    const ev = new Event("unhandledrejection") as Event & { reason: unknown };
    ev.reason = new Error("rejected boom");
    window.dispatchEvent(ev);

    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.message).toBe("rejected boom");
  });

  it("replay: falseの場合はtakeReplayを呼ばない", async () => {
    initErrmagic({ endpoint: "https://example.test/errors", app: "my-app", replay: false });
    reportError(new Error("boom"));
    await flushMicrotasks();
    expect(recorderMocks.takeReplay).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("__resetForTestはwindow.onerrorを元のハンドラに復元する（無条件nullにしない）", async () => {
    const existing = vi.fn().mockReturnValue(true);
    window.onerror = existing;
    initErrmagic({ endpoint: "https://example.test/errors", app: "my-app" });
    // initErrmagicによってerrmagic自身のハンドラにラップされている
    expect(window.onerror).not.toBe(existing);

    __resetForTest();
    expect(window.onerror).toBe(existing);
  });

  it("同一エラーキーへのリプレイ添付はセッション毎に1回のみ試行する", async () => {
    recorderMocks.hasAttachedFor.mockReturnValue(false);
    recorderMocks.takeReplay.mockResolvedValue("gzipbase64");
    initErrmagic({
      endpoint: "https://example.test/errors",
      app: "my-app",
      dedupeWindowMs: 1, // 即座に窓超過させて2回目も送信させる
    });
    reportError(new Error("boom"));
    await flushMicrotasks();
    expect(recorderMocks.markAttached).toHaveBeenCalledTimes(1);

    // 2回目は hasAttachedFor が true を返す想定（実運用ではmarkAttached後はtrueになる）
    recorderMocks.hasAttachedFor.mockReturnValue(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    reportError(new Error("boom"));
    await flushMicrotasks();
    expect(recorderMocks.takeReplay).toHaveBeenCalledTimes(1);
  });
});
