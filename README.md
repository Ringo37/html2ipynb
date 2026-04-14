# html2ipynb

Jupyter Notebook を HTML に変換したものを `.ipynb` に再変換する VSCode 拡張機能。

## 使い方

以下のいずれかの方法で変換できます。

- エクスプローラーで HTML ファイルを右クリック → **Convert HTML to ipynb**
- HTML ファイルをエディタで開いた状態で右クリック → **Convert HTML to ipynb**

変換後、同じディレクトリに `.ipynb` ファイルが生成されます。

## 設定

| 設定項目                    | 説明                              | デフォルト |
| --------------------------- | --------------------------------- | ---------- |
| `html2ipynb.includeOutputs` | 実行結果（outputs）も変換に含める | `true`     |

`html2ipynb.includeOutputs` を `false` にすると、コードセルの実行結果を除いた状態で変換します。
