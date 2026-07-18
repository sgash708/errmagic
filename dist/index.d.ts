interface ErrmagicOptions {
    /** 必須。POST先URL */
    endpoint: string;
    /** 必須。例 'my-app' */
    app: string;
    /** リプレイ添付を有効にするか。default true */
    replay?: boolean;
    /** 同一エラーのデデュープ窓（ms）。default 300_000 */
    dedupeWindowMs?: number;
    /** 送信直前フック。nullを返すと送信中止 */
    beforeSend?: (report: ErrorReport) => ErrorReport | null;
}
interface ErrorReport {
    app: string;
    name: string;
    message: string;
    stack: string;
    url: string;
    user_agent: string;
    occurred_at: string;
    replay: string | null;
    replay_format: "rrweb-gzip-base64" | null;
}

/**
 * errmagic を初期化する。二重呼び出し時は後勝ちでオプションを上書きする（警告なし）。
 */
declare function initErrmagic(options: ErrmagicOptions): void;
/**
 * 任意のタイミングでエラーを手動報告する。init前に呼ばれた場合は何もしない。
 */
declare function reportError(error: unknown, context?: Record<string, unknown>): void;

/**
 * @internal テスト専用。init状態・グローバルリスナーをリセットする。
 * 本番コードから呼ばれることは想定しない。
 */
declare function __resetForTest(): void;

export { type ErrmagicOptions, type ErrorReport, __resetForTest, initErrmagic, reportError };
