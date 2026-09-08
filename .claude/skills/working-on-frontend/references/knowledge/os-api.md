# `os.*` の UI と結果

確認・入力・通知は [os.ts](../../../../../packages/frontend/src/os.ts) の既存 helper を使い、ブラウザ標準の alert/confirm/prompt を新しく直接呼ばない。型と返り値は実装を正本とする。

| 操作 | 選ぶ入口と注意 |
| --- | --- |
| 通知 | `alert`、`toast`。表示の完了と API 処理の成功を混同しない |
| 確認 | `confirm`。`type` を指定し、返る `{ canceled }` を見て取消時に副作用を起こさない |
| 入力 | `inputText`、`inputNumber`、`inputDatetime`、`select`、`form`。取消と空入力を区別し、結果の union を絞る |
| メニュー | `popupMenu`、`contextMenu`。anchor とイベント、閉じた後のフォーカスを確認する |
| 独自 popup | `popup`。同期的に `{ dispose }` を返す。props・emits の型と終了イベントを合わせる |
| 遅延読込する popup | `popupAsyncWithDialog`。読込失敗を表示する非同期入口 |
| API 操作と結果表示 | `apiWithDialog`、`promiseDialog`。エラー UI を出しても返した Promise の reject は成功へ変わらない |

## 副作用と寿命

`apiWithDialog` は query mutation とエラー表示を扱う。呼び出し側では成功後だけ状態を進め、失敗時の再操作や送信中 state の解除を定める。既に helper が表示したエラーを重ねて表示せず、取消や失敗を成功として扱う catch を置かない。エラーを上位へ渡すか、操作境界で処理を止めるかは呼び出し側の責務に合わせる。

`popup` の dispose は登録を解除するためのもの。ダイアログの確定・取消イベントと、閉じる遷移が終わる `closed` 等のイベントは部品ごとに確認する。既存の `alert` / `confirm` は結果を `done` で返し、`closed` で dispose する。この違いを消して閉じるアニメーションや待機中 Promise を壊さない。

helper を使ったことだけで操作性が保証されたと判断しない。実画面で表示、確定、取消、keyboard、フォーカス復帰を確認する。story の popup は [カタログのハーネス](component-catalog.md) に置かれるため、本体との描画先の違いにも注意する。
