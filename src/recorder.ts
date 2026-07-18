import { record, type eventWithTime } from "rrweb";

// rrweb 2.1.0 の recordOptions には unmaskTextSelector が存在しないため、
// maskTextFn 内で `.rr-unmask` 配下かどうかを判定して素通しする方式を採用する。
const UNMASK_SELECTOR = ".rr-unmask";
const CHECKOUT_EVERY_N_MS = 30_000;

interface Buffer {
  previous: eventWithTime[];
  current: eventWithTime[];
}

const buffer: Buffer = { previous: [], current: [] };
const attachedKeys = new Set<string>();
let stopRecording: (() => void) | undefined;

function maskText(text: string, element: HTMLElement | null): string {
  if (element?.closest(UNMASK_SELECTOR)) {
    return text;
  }
  return text.replace(/[\S]/g, "*");
}

/**
 * rrweb.record をデフォルト全マスク設定で起動し、直近セグメントをリングバッファに保持する。
 * 既に開始済みなら何もしない（多重呼び出し安全）。
 */
export function startRecorder(): void {
  if (stopRecording) {
    return;
  }
  buffer.previous = [];
  buffer.current = [];
  const stop = record({
    emit(event, isCheckout) {
      if (isCheckout) {
        buffer.previous = buffer.current;
        buffer.current = [];
      }
      buffer.current.push(event);
    },
    maskAllInputs: true,
    maskTextSelector: "*",
    maskTextFn: maskText,
    blockSelector: "img,video,canvas",
    checkoutEveryNms: CHECKOUT_EVERY_N_MS,
  });
  stopRecording = stop ?? (() => {});
}

export function stopRecorder(): void {
  stopRecording?.();
  stopRecording = undefined;
  buffer.previous = [];
  buffer.current = [];
  attachedKeys.clear();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Blob#stream() が未実装の環境（jsdom 等）でも動くよう、
 * CompressionStream の writable/readable を直接読み書きしてgzip化する。
 */
async function gzip(input: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const writeDone = writer.write(input as BufferSource).then(() => writer.close());
  const reader = cs.readable.getReader();
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
  return merged;
}

/**
 * 直近約60秒（previous + current の2セグメント）のイベントを
 * JSON化 → gzip(CompressionStream) → base64化して返す。
 * CompressionStream 非対応環境では null を返す（機能検出）。
 */
export async function takeReplay(): Promise<string | null> {
  if (typeof CompressionStream === "undefined") {
    return null;
  }
  try {
    const events = [...buffer.previous, ...buffer.current];
    const json = JSON.stringify(events);
    const inputBytes = new TextEncoder().encode(json);
    const compressed = await gzip(inputBytes);
    return bytesToBase64(compressed);
  } catch {
    return null;
  }
}

/** セッション内・エラーキー毎に一度だけリプレイを添付するための判定。 */
export function hasAttachedFor(key: string): boolean {
  return attachedKeys.has(key);
}

export function markAttached(key: string): void {
  attachedKeys.add(key);
}

/** @internal テスト専用。バッファの現在状態を参照する。 */
export function __getBufferForTest(): Buffer {
  return buffer;
}
