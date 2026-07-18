import {
  reportError
} from "./chunk-A7XTZ2UD.js";

// src/react.tsx
import * as React from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function DefaultFallback() {
  return /* @__PURE__ */ jsxs("div", { role: "alert", style: { padding: 16, textAlign: "center", fontFamily: "sans-serif" }, children: [
    /* @__PURE__ */ jsx("p", { children: "\u4E88\u671F\u3057\u306A\u3044\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002" }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: () => window.location.reload(), children: "\u518D\u8AAD\u307F\u8FBC\u307F" })
  ] });
}
var ErrmagicErrorBoundary = class extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    try {
      reportError(error, { componentStack: errorInfo.componentStack });
    } catch {
    }
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? /* @__PURE__ */ jsx(DefaultFallback, {});
    }
    return this.props.children;
  }
};
export {
  ErrmagicErrorBoundary
};
//# sourceMappingURL=react.js.map