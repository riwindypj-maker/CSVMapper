# CSVMapper ドキュメントインデックス

## この文書の責務

この文書は、CSVMapper のドキュメント全体の入口として、読む順序、文書一覧、各文書の責務、正本の場所を定義する。

## この文書で扱う正本範囲

ドキュメントの読む順序、文書一覧、各文書の責務、正本の場所。

## 読む順序

1. `docs/requirements.md`
2. `docs/specs/domain/`
3. `docs/specs/features/`
4. `docs/specs/states/`
5. `docs/specs/screens/`
6. `docs/specs/design/`
7. `docs/specs/modules/`
8. `docs/non-functional.md`
9. 対応する仕様と同じ順序で `docs/tests/string-transformations.md`、`docs/tests/transformation-graph.md`、`docs/tests/csv-io.md`、`docs/tests/preview-and-validation.md`、`docs/tests/desktop-ui-and-lifecycle.md`、`docs/tests/performance-and-platform.md`
10. `docs/implementation-plan.md`
11. 必要な場合だけ `docs/reports/`

## ドキュメント一覧

| 種別                         | パス                                                 | 責務                                                                |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| 要件定義                     | `docs/requirements.md`                               | 目的、利用者、初期リリース範囲、対象外、前提、制約                  |
| CSV形式                      | `docs/specs/domain/csv-format.md`                    | CSV構文、文字コード、改行、値の型                                   |
| 変換グラフ                   | `docs/specs/domain/transformation-graph.md`          | ノード、接続、評価、不変条件                                        |
| 文字列変換                   | `docs/specs/domain/string-transformations.md`        | 編集ブロックごとの変換規則                                          |
| CSV読込                      | `docs/specs/features/csv-import.md`                  | ファイル選択、解析、入力項目                                        |
| マッピング編集               | `docs/specs/features/mapping-editor.md`              | キャンバス、接続、Undo・Redo、初期化                                |
| プレビュー・検証             | `docs/specs/features/preview-and-validation.md`      | 手動プレビュー、エラー、警告、出力可否                              |
| CSV出力                      | `docs/specs/features/csv-export.md`                  | 出力設定、生成、安全な上書き、中止                                  |
| セッション状態               | `docs/specs/states/application-session.md`           | 起動から終了までの状態と破棄規則                                    |
| メイン画面                   | `docs/specs/screens/main-screen.md`                  | マッピング作業画面の表示と操作                                      |
| 出力関連画面                 | `docs/specs/screens/output-workflow.md`              | 出力設定、問題一覧、処理結果の画面仕様                              |
| UI共通仕様                   | `docs/specs/design/ui-conventions.md`                | レイアウト、状態表現、アクセシビリティ                              |
| アプリケーション構成         | `docs/specs/design/application-architecture.md`      | 技術検証用のレイヤ、依存方向、実行境界、技術候補、配布単位の設計案  |
| マッピングキャンバス         | `docs/specs/design/mapping-canvas.md`                | 技術検証用の描画構成、座標、仮想化、操作、アクセシビリティの設計案  |
| Processing Core              | `docs/specs/modules/processing-core.md`              | 技術検証用の CSV・Unicode・グラフ評価・プレビュー・出力の処理契約案 |
| 非機能要件                   | `docs/non-functional.md`                             | 対応環境、性能、信頼性、セキュリティ、保守性、ログ                  |
| 文字列変換テスト             | `docs/tests/string-transformations.md`               | 編集ブロックと文字境界のテスト条件                                  |
| 変換グラフテスト             | `docs/tests/transformation-graph.md`                 | 接続、循環、評価順、履歴のテスト条件                                |
| CSV入出力テスト              | `docs/tests/csv-io.md`                               | CSV解析、文字コード、安全な出力のテスト条件                         |
| プレビュー・検証テスト       | `docs/tests/preview-and-validation.md`               | 手動プレビューと出力可否のテスト条件                                |
| UI・ライフサイクルテスト     | `docs/tests/desktop-ui-and-lifecycle.md`             | 画面操作、アクセシビリティ、状態破棄のテスト条件                    |
| 性能・プラットフォームテスト | `docs/tests/performance-and-platform.md`             | 性能、OS互換性、ログの受入条件                                      |
| 実装計画                     | `docs/implementation-plan.md`                        | 実装順序、進捗、依存関係、テスト方針、影響範囲                      |
| 技術検証レポート             | `docs/reports/20260723_0026_technical-validation.md` | 技術調査結果と未検証事項。仕様の正本ではない                        |

## 正本の場所

| 内容                                                 | 正本                                            |
| ---------------------------------------------------- | ----------------------------------------------- |
| 目的、対象範囲、対象外、制約                         | `docs/requirements.md`                          |
| CSVの解釈と表現                                      | `docs/specs/domain/csv-format.md`               |
| グラフ構造と接続判定                                 | `docs/specs/domain/transformation-graph.md`     |
| 文字列処理結果                                       | `docs/specs/domain/string-transformations.md`   |
| 利用者向け機能の振る舞い                             | `docs/specs/features/`                          |
| アプリケーションの状態遷移                           | `docs/specs/states/application-session.md`      |
| 画面の表示、操作、バリデーション                     | `docs/specs/screens/`                           |
| UIの見た目と横断的制約                               | `docs/specs/design/ui-conventions.md`           |
| アプリケーション構成、依存方向、実行境界             | `docs/specs/design/application-architecture.md` |
| キャンバスの描画・仮想化・キーボード設計             | `docs/specs/design/mapping-canvas.md`           |
| CSV・Unicode・グラフ評価の実装境界                   | `docs/specs/modules/processing-core.md`         |
| 非機能要件                                           | `docs/non-functional.md`                        |
| テストケース、入力データ、観測点、実行方法、合否条件 | `docs/tests/`                                   |
| 実装順序と進捗                                       | `docs/implementation-plan.md`                   |

API、データベースおよび永続化設定は初期リリースの対象外であるため、対応する仕様書は作成しない。`docs/reports/` は調査記録であり仕様の正本ではない。技術検証用の設計案は各文書のステータスに従い、検証完了まで確定基本設計として扱わない。正本以外の文書には同じ仕様本文を書かず、正本への参照と文書固有の内容だけを記載する。

## 未決定事項

なし。

## 質問事項

なし。
