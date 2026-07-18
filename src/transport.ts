import type { ErrmagicOptions, ErrorReport } from "./types";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 20000;

function stringifyUnknown(value: unknown): { name: string; message: string; stack: string } {
  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: value.message ?? "",
      stack: value.stack ?? "",
    };
  }
  if (typeof value === "string") {
    return { name: "Error", message: value, stack: "" };
  }
  try {
    return { name: "Error", message: JSON.stringify(value) ?? String(value), stack: "" };
  } catch {
    return { name: "Error", message: String(value), stack: "" };
  }
}

/**
 * 任意の値（Error / string / unknown）から送信用 ErrorReport を安全に構築する。
 * context は現状ペイロード契約に含まれないため保持しない（将来拡張余地）。
 */
export function buildReport(
  error: unknown,
  _context: Record<string, unknown> | undefined,
  options: ErrmagicOptions,
  replay: string | null,
): ErrorReport {
  const { name, message, stack } = stringifyUnknown(error);
  return {
    app: options.app,
    name,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    stack: stack.slice(0, MAX_STACK_LENGTH),
    url: typeof location !== "undefined" ? location.href : "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    occurred_at: new Date().toISOString(),
    replay,
    replay_format: replay ? "rrweb-gzip-base64" : null,
  };
}

/**
 * fetch keepalive で fire-and-forget 送信する。失敗は握りつぶす（エラーループ防止）。
 */
export function send(endpoint: string, report: ErrorReport): void {
  try {
    if (typeof fetch !== "function") {
      return;
    }
    const body = JSON.stringify(report);
    // keepalive は仕様上 64KiB 制限のため大きなリプレイは通常 fetch で送る
    const keepalive = body.length < 60_000;
    fetch(endpoint, {
      method: "POST",
      keepalive,
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  } catch {
    // no-op: レポーター自身がエラーループを起こさないため握りつぶす
  }
}
