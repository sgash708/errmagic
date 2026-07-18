import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("../src/index", () => ({
  reportError: reportErrorMock,
}));

import { ErrmagicErrorBoundary } from "../src/react";

function Bomb(): React.ReactElement {
  throw new Error("boom");
}

describe("ErrmagicErrorBoundary", () => {
  beforeEach(() => {
    reportErrorMock.mockClear();
    // React はエラーバウンダリのテスト時に console.error でログを出すため抑制する
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("エラーが無ければchildrenをそのまま描画する", () => {
    render(
      <ErrmagicErrorBoundary>
        <div>正常表示</div>
      </ErrmagicErrorBoundary>,
    );
    expect(screen.getByText("正常表示")).toBeTruthy();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("子でエラーが発生するとreportErrorを呼びデフォルトfallbackを表示する", () => {
    render(
      <ErrmagicErrorBoundary>
        <Bomb />
      </ErrmagicErrorBoundary>,
    );
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    const [error, context] = reportErrorMock.mock.calls[0];
    expect((error as Error).message).toBe("boom");
    expect(context).toHaveProperty("componentStack");
    expect(screen.getByText("予期しないエラーが発生しました。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeTruthy();
  });

  it("fallbackを渡すとそれが表示される", () => {
    render(
      <ErrmagicErrorBoundary fallback={<div>カスタムフォールバック</div>}>
        <Bomb />
      </ErrmagicErrorBoundary>,
    );
    expect(screen.getByText("カスタムフォールバック")).toBeTruthy();
  });
});
