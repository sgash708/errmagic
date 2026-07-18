import { Deduper } from "./dedupe";
import { hasAttachedFor, markAttached, startRecorder, takeReplay } from "./recorder";
import { buildReport, send } from "./transport";
import type { ErrmagicOptions, ErrorReport } from "./types";

const DEFAULT_DEDUPE_WINDOW_MS = 300_000;

interface InternalState {
  options: ErrmagicOptions;
  deduper: Deduper;
}

let state: InternalState | undefined;
let isProcessing = false;
let listenersAttached = false;
let unhandledRejectionListener: ((event: Event) => void) | undefined;
let previousOnError: Window["onerror"] | undefined;

function computeKey(report: Pick<ErrorReport, "name" | "message" | "stack">): string {
  const firstStackLine = report.stack.split("\n")[0] ?? "";
  return `${report.name}|${report.message.slice(0, 200)}|${firstStackLine}`;
}

function handleError(error: unknown, context?: Record<string, unknown>): void {
  if (!state || isProcessing) {
    return;
  }
  const currentState = state;
  isProcessing = true;
  Promise.resolve()
    .then(async () => {
      const baseReport = buildReport(error, context, currentState.options, null);
      const key = computeKey(baseReport);

      if (!currentState.deduper.shouldReport(key)) {
        return;
      }

      let replay: string | null = null;
      if (currentState.options.replay !== false && !hasAttachedFor(key)) {
        markAttached(key);
        replay = await takeReplay();
      }

      const report = buildReport(error, context, currentState.options, replay);
      const finalReport = currentState.options.beforeSend
        ? currentState.options.beforeSend(report)
        : report;
      if (!finalReport) {
        return;
      }
      send(currentState.options.endpoint, finalReport);
    })
    .catch(() => {
      // no-op: レポーター自身がエラーループを起こさないため握りつぶす
    })
    .finally(() => {
      isProcessing = false;
    });
}

function attachGlobalListeners(): void {
  if (listenersAttached || typeof window === "undefined") {
    return;
  }
  listenersAttached = true;

  try {
    previousOnError = window.onerror;
    window.onerror = function errmagicOnError(
      message,
      source,
      lineno,
      colno,
      error,
    ) {
      try {
        handleError(error ?? message);
      } catch {
        // no-op
      }
      if (typeof previousOnError === "function") {
        return previousOnError.call(window, message, source, lineno, colno, error);
      }
      return false;
    };

    unhandledRejectionListener = (event) => {
      try {
        const reason = (event as PromiseRejectionEvent).reason;
        handleError(reason);
      } catch {
        // no-op
      }
    };
    window.addEventListener("unhandledrejection", unhandledRejectionListener);
  } catch {
    // no-op: リスナー登録に失敗してもレポーター自身は落とさない
  }
}

/**
 * errmagic を初期化する。二重呼び出し時は後勝ちでオプションを上書きする（警告なし）。
 */
export function initErrmagic(options: ErrmagicOptions): void {
  try {
    const dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    state = {
      options: { replay: true, ...options, dedupeWindowMs },
      deduper: new Deduper(dedupeWindowMs),
    };
    attachGlobalListeners();
    startRecorder();
  } catch {
    // no-op: 初期化失敗時もアプリを壊さない
  }
}

/**
 * 任意のタイミングでエラーを手動報告する。init前に呼ばれた場合は何もしない。
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    if (!state) {
      return;
    }
    handleError(error, context);
  } catch {
    // no-op
  }
}

export type { ErrmagicOptions, ErrorReport } from "./types";

/**
 * @internal テスト専用。init状態・グローバルリスナーをリセットする。
 * 本番コードから呼ばれることは想定しない。
 */
export function __resetForTest(): void {
  state = undefined;
  isProcessing = false;
  if (typeof window !== "undefined") {
    if (unhandledRejectionListener) {
      window.removeEventListener("unhandledrejection", unhandledRejectionListener);
    }
    // errmagic が上書きする前の元のハンドラを復元する（無条件で null にはしない）
    window.onerror = previousOnError ?? null;
  }
  listenersAttached = false;
  unhandledRejectionListener = undefined;
  previousOnError = undefined;
}
