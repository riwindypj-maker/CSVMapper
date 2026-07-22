# 技術検証レポート

## この文書の責務

この文書は、CSVMapper の技術選定に関する調査結果、検証可否、判断材料を記録する。仕様の正本ではない。

## この文書で扱う正本範囲

React Native 系の互換性、キャンバス、ネイティブ処理、配布方式、ローカル検証環境の調査結果。仕様本文の正本として扱わない。

## 参照する正本

- 要件: `docs/requirements.md`
- 非機能要件: `docs/non-functional.md`
- 仕様: `docs/specs/`
- テスト仕様: `docs/tests/`
- 実装順序: `docs/implementation-plan.md`

## 概要

公式資料と npm レジストリを用いた互換性調査、ローカル開発環境の確認、および macOS 検証用ホストの生成と実ビルドを実施した。Windows と macOS の現行 React Native 実装は同一 minor に揃わないため、OS 別のアプリケーションホストと共通モジュールを分離する構成が必要である。

macOS ホストは React Native `0.81.6`、React Native macOS `0.81.9`、React `19.1.4` で生成し、Debug/Release の両構成、実起動、固定 lockfile からのクリーンビルドを確認した。CMake で生成する Processing Core の静的ライブラリも Xcode Build Phase から両構成・両アーキテクチャ向けに生成してリンクできた。Windows 開発環境、キャンバス性能、大容量 CSV、本番署名済み配布物の検証は完了していない。現時点の技術検証ステータスは `進行中` とする。

## 調査対象

- React Native、React Native Windows、React Native macOS の現行互換性
- Windows と macOS で共用できるキャンバス描画方式
- UI スレッドから分離した CSV ストリーム処理方式
- Unicode 書記素クラスタと Windows-31J の両 OS 同一処理
- Windows と macOS の配布、署名、インストーラー方式
- 現在の端末で実行できるビルドと検証

## 調査結果

### React Native 系バージョン

2026-07-23 時点の npm レジストリ結果は次のとおりである。

| 対象                 | 公開バージョン | 必要な主要 peer dependency             | 判定               |
| -------------------- | -------------: | -------------------------------------- | ------------------ |
| React Native Windows |       `0.84.0` | React Native `0.84.1`、React `^19.2.3` | Windows の現行候補 |
| React Native macOS   |       `0.81.9` | React Native `0.81.6`、React `^19.1.4` | macOS の現行候補   |
| react-native-svg     |      `15.15.5` | React、React Native は任意の対応版     | キャンバス候補     |
| @dagrejs/dagre       |        `3.0.0` | なし                                   | 自動整列候補       |

React Native Windows 0.84 は Active Support であり、0.82 以降は New Architecture 専用である。一方、React Native macOS の最新公開版は 0.81 系である。React Native macOS は React Native と同じ minor を要求するため、単一のアプリケーション直下へ両 OS を同居させて依存を一組に固定する構成は採用できない。

Windows は React Native `0.84.1`、macOS は React Native `0.81.6` を使う OS 別ホストを置き、画面とアプリケーションロジックは共通パッケージとして共有する案を採用候補とする。両ホストで同じ共通ソースがビルドできることは実機検証が必要である。

### キャンバス

`react-native-svg` は公式リポジトリで Windows、macOS、Fabric を対象に含めている。アクセシビリティを保つため、ノードと端子を React Native の `View`、接続線を単一 SVG レイヤで描画する構成を候補とする。

2,000 ノードでの応答性能は資料調査だけでは判定できない。viewport culling、表示領域外のノード非描画、移動中の一時座標と操作完了時の状態確定を含むプロトタイプを両 OS で測定する必要がある。Windows 対応が公式に確認できない描画・アニメーションライブラリは必須依存にしない。

### ファイル処理とワーカー

React Native Windows は TypeScript 契約から C++ Turbo Native Module を生成する公式手順を提供している。100MB、100 万行、3 秒以内の中止、1GiB 以下のメモリ増加を満たすため、行単位のデータを JavaScript とネイティブ間で往復させず、共有 C++ 処理コアへ処理スナップショットを一度渡す方式を候補とする。

Unicode 処理には ICU4C `78.3` を候補とする。ICU はストリーム文字コード変換、`windows-932`、書記素境界を提供し、両 OS で同じ変換表を固定できる。ビルドサイズ、ライセンス同梱、Windows/macOS のリンク方法は未検証である。

### 依存関係管理

Apple は Xcode と Xcode Cloud で Swift Package Manager を直接サポートし、可能な場合は外部依存を Swift Package へ移す案内をしている。一方、React Native macOS `0.81` 系の公式手順は `.xcworkspace`、Podfile、Podspec による CocoaPods 統合を前提としており、Swift Package Manager だけで置き換える公式手順は確認できない。

CocoaPods は 2026 年 12 月 2 日に公開 Trunk への新規 Podspec 登録を終了し、Specs リポジトリを読み取り専用にする計画を公表している。既存 Pod、独自 Specs リポジトリ、`node_modules` などに同梱された Podspec の利用は直ちに停止しないが、公開 Trunk へ新しい Podspec が登録され続けることを前提とする設計は長期保守上のリスクになる。

UI 共通化を優先するため React Native macOS は維持する。CocoaPods は React Native macOS とローカル Podspec のビルド接着層に限定し、macOS 専用 Swift 依存には必要に応じて Swift Package Manager、Windows/macOS 共有 C++ には CMake を使用する案とする。実ビルドでは Podfile.lock に固定された Pod の取得元とチェックサムを確認し、クリーン環境で同じ依存木を再現できること、およびアプリケーション独自の依存が公開 Trunk への新規 Podspec 登録を必要としないことを分けて検証する。

### 配布

- Windows: New Architecture の C++ アプリケーションを x64 MSIX として生成する。
- macOS: arm64 `.app` を Developer ID で署名し、Hardened Runtime を有効にして notarization 後に DMG で配布する。

MSIX は本番配布時に信頼された証明書による署名が必要である。Microsoft Store 経由の場合は Store が再署名する。macOS の App Store 外配布は Developer ID 署名と notarization が必要である。最終的な Store 利用有無と署名資格情報は未確定である。

### ローカル環境

| 項目                  | 結果                                     |
| --------------------- | ---------------------------------------- |
| Node.js               | `22.23.1`                                |
| npm                   | `10.9.8`                                 |
| CPU                   | Apple Silicon arm64                      |
| Apple Clang           | `21.0.0`                                 |
| Xcode                 | `26.6`                                   |
| Swift                 | `6.3.3`                                  |
| CocoaPods             | Homebrew `1.17.0`、Bundler 固定 `1.15.2` |
| Bundler               | `4.0.16`                                 |
| Ruby                  | `4.0.6`                                  |
| CMake                 | `4.4.0`                                  |
| Windows/Visual Studio | 現在の端末では利用不可                   |

`apps/macos` に macOS 検証用ホストを生成し、Bundler 管理下の CocoaPods で 72 Pods を解決した。Debug/Release の両ビルドと ad-hoc 署名検証に成功し、Release には `main.jsbundle` が同梱された。Release 実行ファイルは arm64/x86_64 の Universal Binary、最低対応 OS は要件どおり macOS `14.0` であり、Metro を起動していない状態でアプリを起動できた。

Processing Core は CMake の静的ライブラリとして Xcode Build Phase から Debug/Release と arm64/x86_64 の各構成向けに生成され、アプリへのリンクと初期化コードからの参照を確認した。既存の `node_modules`、Bundler キャッシュ、Pods、DerivedData を除いた一時環境でも `npm ci --no-audit`、`bundle install`、`pod install --deployment`、arm64 Debug ビルド、Jest、ESLint、TypeScript、CTest が成功した。SocketRocket は React Native macOS 同梱のローカル Podspec と固定コミットから取得され、CocoaPods Trunk の Specs リポジトリには依存しない。

クリーンな `npm ci` では React Native 0.81 系の開発ツールチェーンが固定する ESLint 8、glob 7 などの間接依存に非推奨警告が出る。アプリ実行依存の警告ではなく、互換性を壊す強制的な major 更新は行わず、React Native macOS の更新時に解消状況を確認する。React Native Windows は Windows 上でのみ開発・ビルドできるため、ユーザー方針に従い今回の対応対象から除外し、環境用意後の検証事項とする。

## 検証マトリクス

| ID     | 検証項目                                       | 結果     | 残作業                                                                                           |
| ------ | ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| TV-001 | React Native 系の公開版と peer dependency      | 完了     | リリース着手時に再確認する                                                                       |
| TV-002 | OS 別ホスト構成の依存解決                      | 一部完了 | macOS ホストは完了。Windows は環境用意後に検証する                                               |
| TV-003 | Windows Debug/Release ビルド                   | 対象外   | 今回は実施せず、Windows 環境用意後に再開する                                                     |
| TV-004 | macOS Debug/Release ビルド                     | 完了     | macOS 14 以上、Debug/Release、Universal Release、起動を確認済み                                  |
| TV-005 | 2,000 ノードの描画・移動・接続                 | 未実施   | 両 OS で p95 とメモリを測定する                                                                  |
| TV-006 | ズーム・複数選択・キーボード・アクセシビリティ | 未実施   | View と SVG の試作を両 OS で操作確認する                                                         |
| TV-007 | 100MB・100 万行・500 列のストリーム処理        | 未実施   | C++ 処理コアの試作で時間とメモリを測定する                                                       |
| TV-008 | 中止受付 100ms・停止 3 秒                      | 未実施   | プレビューと出力を各 10 回測定する                                                               |
| TV-009 | UTF-8・Windows-31J・書記素クラスタの同一結果   | 未実施   | ICU 固定版と共通フィクスチャで比較する                                                           |
| TV-010 | 安全な置換と同一実体判定                       | 未実施   | リンク、容量不足、置換失敗を両 OS で注入する                                                     |
| TV-011 | MSIX と notarized DMG                          | 未実施   | 署名用資格情報を分離してクリーン環境で確認する                                                   |
| TV-012 | macOS の依存関係再現性                         | 完了     | 一時クリーン環境で npm、Bundler、Pod、Debug ビルドを再現済み                                     |
| TV-013 | Processing Core のホスト連携                   | 一部完了 | macOS の CMake `.a` と Xcode 連携は完了。Windows の `.lib` と MSBuild 連携は環境用意後に検証する |

## 判断材料

- OS 別ホストは React Native 系の minor 差を閉じ込められるが、共通 UI を両方で継続ビルドする CI が必須になる。
- CocoaPods を React Native macOS の接着層に限定してもツール自体への依存は残るため、公開 Trunk の新規登録停止と React Native macOS の将来の統合方式を継続監視する必要がある。
- C++ 共有コアは CSV データを JavaScript 側へ全件渡さずに済み、両 OS の処理結果も一箇所で管理できる。
- View と SVG の混成キャンバスはアクセシビリティを確保しやすいが、2,000 ノード性能は仮想化を含む実測が必要である。
- 技術資料だけでは非機能要件を満たした証拠にならない。検証マトリクスの実測項目が完了するまで技術選定を最終確定しない。

## 仕様への反映要否

反映が必要である。OS 別ホスト、共有処理コア、キャンバス、ネイティブ処理契約を技術検証用の基本設計案へ反映する。

## 反映先

- `docs/specs/design/application-architecture.md`
- `docs/specs/design/mapping-canvas.md`
- `docs/specs/modules/processing-core.md`
- `docs/implementation-plan.md`

反映先を実装根拠の正本とし、このレポート自体は実装根拠として使わない。

## 未決定事項

- Windows ホストで共通 UI が React Native Windows の minor に適合すること
- CMake の静的ライブラリを Windows のホストビルドから構成別に生成・リンクできること
- ICU4C `78.3` のバイナリサイズ、リンク方法、配布ライセンスの検証結果
- Microsoft Store の利用有無と本番署名方式
- macOS の DMG 作成手段と署名資格情報の管理方法

## 質問事項

なし。配布チャネルは実装着手前に利用者または配布組織の方針を確認する。

## 参考資料

- [React Native Windows Support Policy](https://microsoft.github.io/react-native-windows/support/)
- [React Native Windows Get Started](https://microsoft.github.io/react-native-windows/docs/getting-started/)
- [React Native macOS Get Started](https://microsoft.github.io/react-native-macos/docs/getting-started)
- [React Native macOS Native Platform](https://microsoft.github.io/react-native-macos/docs/guides/native-development)
- [React Native Windows Native Modules](https://microsoft.github.io/react-native-windows/docs/native-platform-modules/)
- [Apple: Making dependencies available to Xcode Cloud](https://developer.apple.com/documentation/Xcode/Making-Dependencies-Available-to-Xcode-Cloud)
- [CocoaPods Trunk Read-only Plan](https://blog.cocoapods.org/CocoaPods-Specs-Repo/)
- [react-native-svg](https://github.com/software-mansion/react-native-svg)
- [ICU Downloads](https://unicode-org.github.io/icu/download/)
- [ICU Conversion](https://unicode-org.github.io/icu/userguide/conversion/)
- [MSIX signing](https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview)
- [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

## 関連ドキュメント

- `docs/index.md`
