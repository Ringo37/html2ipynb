# Change Log

## [0.2.0] - 2026-04-14

### Added

- 実行結果（outputs）の変換に対応
  - stdout / stderr ストリーム出力
  - execute_result（text/plain、text/html）
  - display_data（text/plain、text/html、image/png、image/svg+xml）
  - エラー出力（ename / evalue / traceback）
- 設定項目 `html2ipynb.includeOutputs` を追加（実行結果を含めるか切り替え可能）
- エクスプローラーから HTML ファイルを開かずに右クリックで変換できるように対応
- ユニットテストを追加（`toLines` / `parseOutputs` / `convertHtmlToIpynb` 計 21 件）
- GitHub Actions による VS Code Marketplace への自動デプロイを設定

### Changed

- 変換ロジックを `converter.ts` に分離し、VSCode API に非依存な形に整理

## [0.1.0] - 2025-07-24

### Added

- HTML ファイルを Jupyter Notebook（`.ipynb`）に変換する基本機能
- Markdown セルの変換（h1〜h6 → 見出し記法、ピルクロウ記号の除去）
- コードセルの変換（ソースコード・`execution_count` の取得）
- エディタの右クリックメニューおよびエクスプローラーのコンテキストメニューへの統合
