import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { eventWithTime } from "rrweb";

type EmitFn = (event: eventWithTime, isCheckout?: boolean) => void;

const recordMock = vi.fn();

vi.mock("rrweb", () => ({
  record: (...args: unknown[]) => recordMock(...args),
}));

function makeEvent(data: unknown = {}): eventWithTime {
  return { type: 3, data, timestamp: Date.now() } as unknown as eventWithTime;
}

async function gunzipBase64ToJson(base64: string): Promise<unknown> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  const writeDone = writer.write(bytes).then(() => writer.close());
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  await writeDone;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(merged));
}

describe("recorder", () => {
  let emit: EmitFn;

  beforeEach(async () => {
    vi.resetModules();
    recordMock.mockReset();
    recordMock.mockImplementation((options: { emit: EmitFn }) => {
      emit = options.emit;
      return () => {};
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rrweb.record を全マスク設定で起動する", async () => {
    const { startRecorder } = await import("../src/recorder");
    startRecorder();
    expect(recordMock).toHaveBeenCalledTimes(1);
    const options = recordMock.mock.calls[0][0];
    expect(options.maskAllInputs).toBe(true);
    expect(options.maskTextSelector).toBe("*");
    expect(options.blockSelector).toBe("img,video,canvas");
    expect(options.checkoutEveryNms).toBe(30_000);
    expect(typeof options.maskTextFn).toBe("function");
  });

  it(".rr-unmask 配下の要素はmaskTextFnでテキストが素通しされる", async () => {
    const { startRecorder } = await import("../src/recorder");
    startRecorder();
    const options = recordMock.mock.calls[0][0];
    const unmaskEl = document.createElement("div");
    unmaskEl.className = "rr-unmask";
    document.body.appendChild(unmaskEl);
    expect(options.maskTextFn("hello", unmaskEl)).toBe("hello");

    const maskedEl = document.createElement("div");
    document.body.appendChild(maskedEl);
    expect(options.maskTextFn("hello", maskedEl)).toBe("*****");
  });

  it("isCheckoutでない emit はバッファに積まれる", async () => {
    const { startRecorder, __getBufferForTest } = await import("../src/recorder");
    startRecorder();
    emit(makeEvent({ n: 1 }), false);
    emit(makeEvent({ n: 2 }), false);
    const buf = __getBufferForTest();
    expect(buf.current.length).toBe(2);
    expect(buf.previous.length).toBe(0);
  });

  it("isCheckout の emit で現行セグメントが旧セグメントに移り、新しい現行セグメントが始まる", async () => {
    const { startRecorder, __getBufferForTest } = await import("../src/recorder");
    startRecorder();
    emit(makeEvent({ n: 1 }), false);
    emit(makeEvent({ n: 2 }), false);
    emit(makeEvent({ n: 3 }), true); // checkout: フルスナップショット
    emit(makeEvent({ n: 4 }), false);

    const buf = __getBufferForTest();
    // isCheckout時点でそれまでのcurrentがpreviousへ、currentは[checkoutEvent]から再開
    expect(buf.previous.length).toBe(2);
    expect(buf.current.length).toBe(2); // checkoutイベント自身 + n:4
  });

  it("さらに2回目のcheckoutで古いpreviousは破棄される", async () => {
    const { startRecorder, __getBufferForTest } = await import("../src/recorder");
    startRecorder();
    emit(makeEvent({ n: 1 }), false);
    emit(makeEvent({ n: 2 }), true);
    emit(makeEvent({ n: 3 }), false);
    emit(makeEvent({ n: 4 }), true);
    emit(makeEvent({ n: 5 }), false);

    const buf = __getBufferForTest();
    expect(buf.previous.length).toBe(2); // [n:2チェックアウト, n:3]
    expect(buf.current.length).toBe(2); // [n:4チェックアウト, n:5]
  });

  it("takeReplayはバッファ内容をgzip+base64化したものを返し、往復でJSONを復元できる", async () => {
    const { startRecorder, takeReplay } = await import("../src/recorder");
    startRecorder();
    emit(makeEvent({ n: 1 }), false);
    emit(makeEvent({ n: 2 }), false);

    const replay = await takeReplay();
    expect(replay).not.toBeNull();
    const restored = (await gunzipBase64ToJson(replay as string)) as unknown[];
    expect(Array.isArray(restored)).toBe(true);
    expect(restored.length).toBe(2);
  });

  it("CompressionStream が未定義の環境では takeReplay は null を返す", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const { startRecorder, takeReplay } = await import("../src/recorder");
    startRecorder();
    emit(makeEvent({ n: 1 }), false);
    const replay = await takeReplay();
    expect(replay).toBeNull();
  });

  it("hasAttachedFor は同一キーで一度だけtrueにできる（呼び出し側がmarkAttachedで制御）", async () => {
    const { hasAttachedFor, markAttached } = await import("../src/recorder");
    expect(hasAttachedFor("err-key-1")).toBe(false);
    markAttached("err-key-1");
    expect(hasAttachedFor("err-key-1")).toBe(true);
    expect(hasAttachedFor("err-key-2")).toBe(false);
  });
});
