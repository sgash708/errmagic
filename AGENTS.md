# AGENTS.md

## リポジトリ概要

`errmagic` は外部SaaSなしのSentryライクなブラウザ用エラーレポーター npm パッケージです。ブラウザJSエラー（`window.onerror` / `unhandledrejection` / 手動 `reportError`）を捕捉し、直近約60秒の rrweb セッションリプレイ（gzip+base64）を添えて任意のエンドポイントへ fire-and-forget で POST します。利用側アプリから git 依存（`github:sgash708/errmagic#vX.Y.Z`）で利用されることを前提にしています。

## ファイル構成

```
src/
├── index.ts        # initErrmagic / reportError の公開API（"errmagic"）
├── types.ts         # ErrmagicOptions / ErrorReport 型
├── dedupe.ts         # 時間窓デデュープ（Deduper）
├── recorder.ts        # rrweb リングバッファ録画 + takeReplay()
├── transport.ts       # ペイロード構築（buildReport）+ fetch keepalive送信（send）
└── react.tsx          # ErrmagicErrorBoundary（"errmagic/react"）
viewer/index.html    # rrweb-player ローカルビューア
test/                 # src と対の *.test.ts / *.test.tsx（vitest + jsdom）
```

## ビルド / テストコマンド

```bash
pnpm install
pnpm test        # vitest run（全テスト）
pnpm test:watch  # vitest（watch）
pnpm typecheck    # tsc --noEmit
pnpm build        # tsup（ESM + d.ts を dist/ に出力）
pnpm pack --dry-run  # 配布物の内容確認
```

## dist コミット運用（重要）

このパッケージは **`dist/` をコミットします**。npm registry を経由せず git 依存（`package.json` の `github:` 指定）でインストールされるため、consumer側で `prepare` ビルドを走らせない前提です。

- `src/` に変更を加えたら **必ず `pnpm build` を実行し、`dist/` の差分もあわせてコミット** すること。
- `dist/` を `.gitignore` に入れないこと。
- リリース時は `package.json` の `version` を上げ、`git tag vX.Y.Z` を打って push する運用（タグ付け・PR作成はコントローラ側で行う想定のため、実装エージェントは行わない）。

## Global Constraints（厳守）

- **デフォルト全マスク**: 全テキスト・全入力値をマスク。`.rr-unmask` クラスでのみテキストマスク解除。`img,video,canvas` は `blockSelector` で全ブロック。
- **エラーループ防止**: 公開経路（`initErrmagic` / `reportError` / グローバルリスナー / ErrorBoundary）はすべて try/catch し、送信失敗は握りつぶす。再入ガードあり。
- **5分デデュープ**: 同一エラー（`name|message先頭200|stack1行目`）は `dedupeWindowMs`（default 300_000ms）内は再送信しない。
- **リプレイはセッション毎・同一エラーキー1回**: 添付を試みるのは1回のみ（成否問わず）。
- **CompressionStream フォールバック**: 非対応ブラウザではリプレイなしでエラーのみ送信（機能検出）。

これらは Task 1〜3 のテストで担保されています。変更する場合は該当テストも更新してください。
