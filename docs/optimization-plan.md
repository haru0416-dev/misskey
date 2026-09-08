# 未公開段階の内部最適化計画

作成日: 2026-09-08
状態: 方針合意済み・実装未着手。以下のチェックボックスは実装と検証の完了時だけ更新する。

## 目的と前提

性能強化、保守運用の容易化、機能追加の容易化を目的に、内部の責務と実行経路を整理する。まだ運用のための公開前であり、内部の破壊的変更と旧互換の廃止を許容する。一方、既存テストが守る挙動、upstream Misskey との連合、認証・公開範囲・データ整合性を維持する。

本書は実装計画であり、性能改善やテスト成功の報告ではない。事前調査はソース読取、workspace 依存解析、連合テスト構成の解析、Bun バージョン確認まで。サーバー起動、既存テスト、upstream との通信、障害注入、負荷試験はこの調査では実施していない。性能効果と条件付きリスクは未検証である。

## 変更可能な境界と保護する契約

| 対象 | 方針 |
| --- | --- |
| 内部関数・型・ディレクトリ・設定形式 | 必要なら破壊的変更する。全利用箇所を移行し、旧 alias・shim・二重実装を残さない |
| fork 内の REST API・SDK・UI | 必要なら同時変更する。型生成と全呼び出し元を揃え、意図した挙動変更を先に記録する |
| ランタイム分岐・互換処理 | 現在の保持理由を確認し、実依存を移してから削除する |
| 既存テスト | 守る挙動と検出能力を維持する。内部実装への依存は等価な利用者観測へ置き換え、削除や skip で回帰を隠さない |
| ActivityPub と upstream 連合 | actor/object URI、署名、宛先、公開範囲、Follow/Undo/Delete/Move 等の意味を維持する |
| 認証・認可・非漏洩 | 性能スコアから独立した採用条件とする。高速化のために検査を省略しない |
| transaction・再配送 | 永続化の原子性、回復、冪等な最終状態を維持する。外部配送に exactly-once を約束しない |
| 既存データ・migration | 未公開でもデータ削除や DB 初期化を暗黙に許可しない。マージ済 migration は変更せず、必要な schema 変更から新規 migration を生成する |

内部互換を保護するための一時的な併存を最終状態にしない。ただし、HTTP 移行完了前にその依存を消すなど、検証不能な順序での削除もしない。

## 事前調査で確認した構造

- ルートで宣言された 13 workspace の内部依存に循環はなかった。ソース import の循環までは検査していない。
- 連合テストの A/B は同じ template を継承し、同一 checkout の backend 成果物を使用する。双方向の通信シナリオはあるが、独立 upstream との検証ではない。
- unit / 通常 e2e の標準ランナーは既に Bun 上で Vitest を起動する。Node テストを理由にした一部コメントは現状と一致しない。通常 e2e と external e2e の違いには同一プロセス／別プロセスの境界がある。
- pg は migration のセッションロック、DB 初期化、直接接続を使う競合テスト、接続予算1の fallback 等に実依存がある。Node HTTP adapter は e2e 制御サーバーにも使われる。
- 投稿は note・集計・outbox を同一 transaction に保存する。予約投稿は draft のロック・再検証・投稿・draft 削除を外側の transaction にまとめる。
- 投稿の inline outbox lease は投入時から30秒。遅延 stage はプロセス全体の直列 chain に積まれる。lease 超過時の重複実行・副作用は追加検証対象であり、障害を再現したわけではない。
- Redis Pub/Sub publish は非同期で、失敗をログ出力する。DB 投稿成功、outbox 完了、リアルタイム到達を同じ保証として扱わない。
- 既存メモリ計測は起動後・GC 後の状態を観測する。既存 query counter は transaction 内のクエリを数えない。
- 調査時の設定基準は Bun 1.4.0、ローカルの実行バイナリは 1.4.2。設定間整合のチェック成功だけでは実行バイナリとの一致を意味しない。

## 実施順序と変更単位

標準順序は A → B → C → D → E。B の責務移動と後処理変更、C の HTTP 移行と DB 移行はそれぞれ別の変更にする。実測に基づく優先順位変更は可能だが、A の正しさの検証を省略しない。

A 完了後の B と C の調査、E の独立した UI 作業は並行可能。同じ composition root や投稿ファイルを同時編集しない。共有部分は統合担当を決めて順に切り替える。性能比較は同じ DB・ホストを使う別の負荷実行と重ねない。

### A. 回帰・連合・性能比較の基準を固定する

対象: backend の unit/e2e/federation、frontend/SDK の既存テスト、連合 compose と CI、既存計測スクリプト。

- [ ] A1: 実行ランタイム、依存 lock、DB/Valkey、データセット、設定、開始 revision を固定し、既存テストの基準結果を取得する。失敗・skip・環境不足を区別し、未実行を成功と扱わない。
- [ ] A2: fork ↔ fork を維持し、fork ↔ 独立 upstream を追加する。初回実装時に対象 release/commit と image digest を固定し、対象バージョンを記録する。peer ごとの DB・設定・成果物を分離する。
- [ ] A3: upstream のアカウント作成等の差はテスト driver に閉じ込め、同じ意味のシナリオを双方の送信役で実行する。実際に検証した revision と方向だけを互換性の保証範囲とする。
- [ ] A4: 公開範囲、署名、取得経路、障害後の再配送について、下記の不足を既存 fixture を再利用して補う。CI は連合に関わる lock/runtime/native 依存変更でも起動するよう対象条件を見直す。
- [ ] A5: 投稿・タイムライン・連合配送の before/after 手順を用意する。数値の採用基準と正しさの判定方法は、候補実装を測る前に固定する。

受け入れ条件:

- actor 解決、Follow/Accept/Undo、投稿と添付、返信、Reaction/Undo、Announce/Undo、Delete、プロフィール Update、Move/alias と follower 引継ぎを固定 upstream との両方向で確認する。
- public/home/followers/specified/localOnly の許可宛先への正しい表示と、未許可宛先への非漏洩を同時に確認する。push だけでなく未署名/署名付き取得、outbox ページ、featured、private parent の露出も対象にする。既存仕様にない一律拒否で成功させない。
- 正常な署名付き GET/POST が成立し、署名後の本文改変、actor/id/Host 不一致等は最終的な副作用を起こさない。HTTP 202 のみを処理成功と数えない。
- 配送先の一時停止・復旧、および相手処理後の応答喪失・再送で、代表的な Note/Follow/Reaction/Delete の状態が収束する。再試行可能な障害と恒久失敗、dead-letter、削除 coordinator の契約を維持する。
- 否定判定を短い固定 sleep だけに依存させない。対象処理の進行・完了と受信側の最終状態を観測する。
- 既存テストが守る契約と追加した安全性条件が成立する。環境不足や未解決の失敗がある状態で、保護済みと判断して次の危険な切り替えを進めない。

### B. 投稿処理の責務と後処理の所有権を整理する

対象: `packages/backend/src/server/rest/note/notes-create.ts`、AP 投稿入口、予約投稿 handler、queue handler、`QueueOutboxStore.ts`、runtime の終了処理。

- [ ] B1: 挙動を変えずに、HTTP の検証・エラー変換・レスポンスと、共通の投稿処理を分離する。HTTP/AP/予約投稿/queue の全 caller を移し、旧 export を削除する。
- [ ] B2: 既存の投稿入力・transaction 拡張点を利用し、queue の入口を Bull.Job ではなく業務入力へ変換する。新しい DI コンテナ、汎用 repository、汎用 event bus は導入しない。
- [ ] B3: inline・遅延 drain・worker の claim、実行権限、完了・失敗処理を共通化する。実行前の所有権確認、lease 超過、古い実行者による完了処理、stage 冪等性を一つの設計として扱う。
- [ ] B4: drain と終了処理を runtime の所有に置き、正常終了時の待機上限・未完了処理の回復と、crash 後の再実行を定義する。

受け入れ条件:

- note/poll/集計/outbox の原子性と、予約投稿の draft ロック・revision 再検証・投稿・削除の原子性を維持する。
- 作成直後のタイムライン参照と、作成時点の antenna 判定に関わる順序を維持する。全面非同期化で応答だけを早めない。
- lease より長い待機・処理、worker との競合、再実行、途中停止で、通知・集計・timeline 等の選定した副作用が重複しない。
- analytics のような非冪等加算を、根拠なく durable retry に載せない。
- 正常 shutdown での待機と強制停止後の回復を別々に検証する。Pub/Sub の到達保証を outbox の保証に読み替えない。
- 責務移動の変更で性能向上を主張しない。後処理方式の変更は A の計測で応答時間と完了時間の両方を評価する。

### C. 不要な runtime 分岐と DB 依存を削減する

対象: `boot/server.ts`、HTTP/streaming adapter、test-server、`runtime-dependencies.ts`、`drizzle.ts`、`db/bun-sql.ts`、fixtures、CLI、migration runner。

- [ ] C1: e2e 制御サーバーを Bun HTTP へ移し、共有 streaming 処理を transport から分離する。その後 Node 専用サーバー分岐を削除する。テスト用 WebSocket client 等の残存利用を巻き込まない。
- [ ] C2: 本番 runtime からテスト専用 pg pool 所有を切り離す。DB fixture・CLI・直接接続を使う競合テストを、同等の契約を守る実装へ順次移す。
- [ ] C3: migration の専用接続・排他・journal・失敗 cleanup を維持して DB 依存を移行する。request driver 変更とは別の変更にする。
- [ ] C4: 固定 Bun 版で query/transaction 混在と接続予算を検証してから、pg fallback、driver 切替、pool 分離、互換型・値変換の廃止可否を個別に決定する。実依存がなくなったものだけ削除する。

受け入れ条件:

- 実 listener で status/body/header、複数 Set-Cookie、OAuth、multipart・本文上限、切断・backpressure、送信キャンセル、TCP/Unix socket、終了処理を維持する。
- WebSocket の認証・公開範囲・購読解除・再接続・payload 上限・切断時の listener/timer 解放を実プロセスで確認する。app.fetch の成功だけで代用しない。
- DB の timestamp/Date、int8、array、JSON、bytea、rows/affected count、SQLSTATE、rollback/savepoint、並行競合、切断後回復を利用側の結果で比較する。
- 接続予算1/2/奇数と高並行で、上限超過・transaction 混線・枯渇がない。予算1を廃止するなら明示的な設定変更として先に決定し、黙って接続数を増やさない。
- migration の同時起動排他、失敗時の lock 解放、再起動時の journal 整合を維持する。セッションロックを異なる pool 接続間に分散させない。
- reset は test 以外で破壊前に拒否し、journal と cache 世代を維持する。テスト制御用 endpoint を本番に露出させない。
- SQL 値・エラーの変換や pool workaround は、単に「旧互換」と分類して削除しない。必要なら最終設計にも残し、保持理由を記録する。

### D. 実測で確認したボトルネックを改善する

対象は A/B/C の測定結果から選ぶ。SQL、pack、fanout、後処理並列度、cache 等の変更を先に決め打ちしない。

- [ ] D1: 同じデータ状態と負荷で基準値を取り、支配的な待ち・CPU・メモリ・IO を特定する。transaction 内も含めた DB 負荷を観測する。
- [ ] D2: 一つの原因に対する候補を実装し、正しさの条件を先に通す。before/after を交互に複数回実行し、生の結果と失敗を保存する。
- [ ] D3: 応答、非同期完了、資源上限のすべてを評価して採否を決める。採用候補だけ残し、旧経路と使い捨て測定コードを除去する。再利用する測定手順は残す。

測定と独立した観測:

| 経路 | 記録する指標 | 性能指標とは別に確認する内容 |
| --- | --- | --- |
| 投稿 | p50/p95/p99、成功/失敗数、DB 待ち、後処理完了時間 | 本文、公開範囲、集計、通知、重複 |
| timeline | 取得時間、DB 往復、CPU、メモリ | 投稿集合、順序、ページ境界、非漏洩 |
| 連合 | queue 待ち、配送完了時間、再試行、最古未処理 age | 相手の保存結果、署名、重複収束、Delete |
| 高負荷・終了 | RSS、CPU、接続数、滞留の増減、終了時間 | 取りこぼし、復旧、未完了処理 |

受け入れ条件:

- 閾値、比較回数、データ初期化、warm/cold 条件、許容する挙動変更を候補測定前に固定する。結果に合わせて後から緩めない。
- 正しさが不成立の候補は性能にかかわらず不採用とする。
- 応答短縮の代わりに無制限の滞留・接続・メモリ消費を増やさない。平均や単一スコアだけで採用しない。
- エージェント起因の起動失敗・壊れた出力を欠測として除外しない。環境要因で除外した実行も件数と理由を残す。
- 「速くなった」は対象経路、Bun/DB 版、データ、回数、未観測の範囲、正しさの結果と併記する。未測定の効果は成果に数えない。

### E. フロントエンドの通信・状態・描画の境界を整理する

対象: main/embed/SDK の API transport、query、Pinia/preferences、Paginator、`MkStreamingNotesTimeline.vue`。

- [ ] E1: main/embed/SDK の共通 HTTP 契約を定義し、通信処理の重複を削減する。認証、匿名通信、cache/invalidation、AbortSignal、multipart、error の意図的な差を明示する。
- [ ] E2: データごとに Pinia/preferences/query/Paginator の所有者と保存・同期先を決め、重複する責務を移行する。全状態を単一 store に押し込まない。
- [ ] E3: timeline の描画と、HTTP 取得・stream 購読・新着保留のライフサイクルを分離する。旧取得・保存経路を残さず caller を切り替える。

受け入れ条件:

- 実ブラウザで main/embed、ログイン/ログアウト・アカウント切替、複数タブ、永続化の復元、offline/通信失敗を確認する。
- cache と保存状態がアカウント間で混ざらず、匿名 embed に認証情報を渡さない。設定同期の read-modify-write を変更する場合は複数端末の競合も検証する。
- timeline の初回取得・ページング・filter 変更・再接続・polling 切替・新着保留/解放が同じ投稿集合と順序を保つ。
- route 移動・unmount・再接続で購読、timer、非同期取得が残らない。仮想化、スクロール位置、keyboard 操作、フォーカスも実 UI で確認する。
- Service Worker の通知操作・アカウント選択・遷移と、embed の親 window 連携を維持する。

## 各変更の共通完了条件

1. 変更前に維持する契約と、意図的に変える契約を記録する。該当する backend/frontend の開発規約を読む。
2. 既存の実装パターンを使い、exported symbol の参照と全 caller を確認して切り替える。互換 alias、旧 code path、不要依存を最終状態に残さない。
3. 近い既存テストで検証し、最後に既存スイートと連合検証を通す。恒久テストは現実的な回帰を検出するものに限定し、実装形状を固定するために増やさない。
4. 実 HTTP/WS/UI/配送/障害回復のうち変更した境界を実際に通す。mock・型検査・静的解析だけを完了証拠にしない。
5. 認証、可視性、SSRF・接続先検証、署名、transaction、冪等性、資源上限、終了処理のうち該当する安全性を確認する。
6. `bun run lint` を実行する。API schema 変更時は `bun run build-misskey-js-with-types`、schema/migration 変更時は生成と `bun run --bun --filter backend check-migrations` を実行する。
7. backend テストには `.config/test.yml` を用意する。既存の設定やデータを破壊せず、専用 DB/Valkey/peer を使う。
8. 新規コードの SPDX、ja-JP.yml のみの locale 編集、ユーザー向け変更の CHANGELOG Unreleased を確認する。試験完了後に不要な一時コードを除去する。
9. 未解決の失敗、未実行、残る保持理由を明記する。旧互換不要でも外部配送結果や DB schema を無視した rollback はしない。失敗した候補を次段階の前提にしない。

## 初回着手時に確定する項目

- 保証対象にする upstream release/commit と image digest。可変の latest を再現可能な保証の代わりにしない。
- 比較に用いる Bun・DB・Valkey の実行版。設定値だけでなく実バイナリと照合する。
- 既存テストの基準結果、代表データ、負荷条件、性能の採否基準。
- DB 接続予算1等、削除候補の設定を維持するか明示的に廃止するか。該当する C の変更前に決める。

これらは実装開始前の確定作業であり、本計画で成功済みと仮定しない。

## 根拠となる入口

リンクはこの文書からの相対パス。実装で移動した場合は本書も更新する。

- [workspace と標準コマンド](../package.json)
- [連合 CI](../.github/workflows/test-federation.yml)、[peer A](../packages/backend/test-federation/compose.a.yml)、[peer B](../packages/backend/test-federation/compose.b.yml)、[共通 template](../packages/backend/test-federation/compose.tpl.yml)
- [backend CI](../.github/workflows/test-backend.yml)、[unit ランナー](../packages/backend/scripts/run_unit.js)、[e2e ランナー](../packages/backend/scripts/run_e2e.js)、[external e2e](../packages/backend/scripts/run_e2e_bun.js)
- [投稿処理](../packages/backend/src/server/rest/note/notes-create.ts)、[予約投稿](../packages/backend/src/queue/handlers/post-scheduled-note.ts)、[outbox](../packages/backend/src/core/queue/QueueOutboxStore.ts)、[event publish](../packages/backend/src/server/rest/events.ts)
- [runtime](../packages/backend/src/runtime-dependencies.ts)、[Bun SQL](../packages/backend/src/db/bun-sql.ts)、[migration](../packages/backend/src/migration-runner.ts)
- [メモリ計測](../packages/backend/scripts/measure-memory.mts)、[比較手順](../.github/scripts/measure-backend-memory-comparison.mts)、[query counter](../packages/backend/test/query-counter.ts)
- [main HTTP](../packages/frontend/src/utility/misskey-api.ts)、[embed HTTP](../packages/frontend-embed/src/misskey-api.ts)、[SDK HTTP](../packages/misskey-js/src/api.ts)、[timeline](../packages/frontend/src/features/notes/components/MkStreamingNotesTimeline.vue)
