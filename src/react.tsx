import * as React from "react";
import { reportError } from "./index";

export interface ErrmagicErrorBoundaryProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface ErrmagicErrorBoundaryState {
  hasError: boolean;
}

function DefaultFallback(): React.ReactElement {
  return (
    <div role="alert" style={{ padding: 16, textAlign: "center", fontFamily: "sans-serif" }}>
      <p>予期しないエラーが発生しました。</p>
      <button type="button" onClick={() => window.location.reload()}>
        再読み込み
      </button>
    </div>
  );
}

export class ErrmagicErrorBoundary extends React.Component<
  ErrmagicErrorBoundaryProps,
  ErrmagicErrorBoundaryState
> {
  constructor(props: ErrmagicErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrmagicErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    try {
      reportError(error, { componentStack: errorInfo.componentStack });
    } catch {
      // no-op: レポーター自身がエラーループを起こさないため握りつぶす
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultFallback />;
    }
    return this.props.children;
  }
}
