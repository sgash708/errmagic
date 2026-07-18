// src/dedupe.ts
var Deduper = class {
  constructor(windowMs) {
    this.lastSeenAt = /* @__PURE__ */ new Map();
    this.windowMs = windowMs;
  }
  shouldReport(key, now = Date.now()) {
    const last = this.lastSeenAt.get(key);
    if (last !== void 0 && now - last < this.windowMs) {
      return false;
    }
    this.lastSeenAt.set(key, now);
    return true;
  }
};

// src/recorder.ts
import { record } from "rrweb";
var UNMASK_SELECTOR = ".rr-unmask";
var CHECKOUT_EVERY_N_MS = 3e4;
var buffer = { previous: [], current: [] };
var attachedKeys = /* @__PURE__ */ new Set();
var stopRecording;
function maskText(text, element) {
  if (element?.closest(UNMASK_SELECTOR)) {
    return text;
  }
  return text.replace(/[\S]/g, "*");
}
function startRecorder() {
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
    checkoutEveryNms: CHECKOUT_EVERY_N_MS
  });
  stopRecording = stop ?? (() => {
  });
}
function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
async function gzip(input) {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const writeDone = writer.write(input).then(() => writer.close());
  const reader = cs.readable.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
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
async function takeReplay() {
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
function hasAttachedFor(key) {
  return attachedKeys.has(key);
}
function markAttached(key) {
  attachedKeys.add(key);
}

// src/transport.ts
var MAX_MESSAGE_LENGTH = 2e3;
var MAX_STACK_LENGTH = 2e4;
function stringifyUnknown(value) {
  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: value.message ?? "",
      stack: value.stack ?? ""
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
function buildReport(error, _context, options, replay) {
  const { name, message, stack } = stringifyUnknown(error);
  return {
    app: options.app,
    name,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    stack: stack.slice(0, MAX_STACK_LENGTH),
    url: typeof location !== "undefined" ? location.href : "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    occurred_at: (/* @__PURE__ */ new Date()).toISOString(),
    replay,
    replay_format: replay ? "rrweb-gzip-base64" : null
  };
}
function send(endpoint, report) {
  try {
    if (typeof fetch !== "function") {
      return;
    }
    const body = JSON.stringify(report);
    const keepalive = body.length < 6e4;
    fetch(endpoint, {
      method: "POST",
      keepalive,
      headers: { "Content-Type": "application/json" },
      body
    }).catch(() => {
    });
  } catch {
  }
}

// src/index.ts
var DEFAULT_DEDUPE_WINDOW_MS = 3e5;
var state;
var isProcessing = false;
var listenersAttached = false;
var unhandledRejectionListener;
var previousOnError;
function computeKey(report) {
  const firstStackLine = report.stack.split("\n")[0] ?? "";
  return `${report.name}|${report.message.slice(0, 200)}|${firstStackLine}`;
}
function handleError(error, context) {
  if (!state || isProcessing) {
    return;
  }
  const currentState = state;
  isProcessing = true;
  Promise.resolve().then(async () => {
    const baseReport = buildReport(error, context, currentState.options, null);
    const key = computeKey(baseReport);
    if (!currentState.deduper.shouldReport(key)) {
      return;
    }
    let replay = null;
    if (currentState.options.replay !== false && !hasAttachedFor(key)) {
      markAttached(key);
      replay = await takeReplay();
    }
    const report = buildReport(error, context, currentState.options, replay);
    const finalReport = currentState.options.beforeSend ? currentState.options.beforeSend(report) : report;
    if (!finalReport) {
      return;
    }
    send(currentState.options.endpoint, finalReport);
  }).catch(() => {
  }).finally(() => {
    isProcessing = false;
  });
}
function attachGlobalListeners() {
  if (listenersAttached || typeof window === "undefined") {
    return;
  }
  listenersAttached = true;
  try {
    previousOnError = window.onerror;
    window.onerror = function errmagicOnError(message, source, lineno, colno, error) {
      try {
        handleError(error ?? message);
      } catch {
      }
      if (typeof previousOnError === "function") {
        return previousOnError.call(window, message, source, lineno, colno, error);
      }
      return false;
    };
    unhandledRejectionListener = (event) => {
      try {
        const reason = event.reason;
        handleError(reason);
      } catch {
      }
    };
    window.addEventListener("unhandledrejection", unhandledRejectionListener);
  } catch {
  }
}
function initErrmagic(options) {
  try {
    const dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    state = {
      options: { replay: true, ...options, dedupeWindowMs },
      deduper: new Deduper(dedupeWindowMs)
    };
    attachGlobalListeners();
    startRecorder();
  } catch {
  }
}
function reportError(error, context) {
  try {
    if (!state) {
      return;
    }
    handleError(error, context);
  } catch {
  }
}
function __resetForTest() {
  state = void 0;
  isProcessing = false;
  if (typeof window !== "undefined") {
    if (unhandledRejectionListener) {
      window.removeEventListener("unhandledrejection", unhandledRejectionListener);
    }
    window.onerror = previousOnError ?? null;
  }
  listenersAttached = false;
  unhandledRejectionListener = void 0;
  previousOnError = void 0;
}

export {
  initErrmagic,
  reportError,
  __resetForTest
};
//# sourceMappingURL=chunk-A7XTZ2UD.js.map