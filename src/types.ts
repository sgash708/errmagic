export interface ErrmagicOptions {
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

export interface ErrorReport {
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
