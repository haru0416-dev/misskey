# 未公開段階の内部最適化計画

作成日: 2026-09-08
状態: SQL計画・実行scope・保存前受付の分離、基本保存とsnapshot取得の集約、後処理の有限並行実行まで実装・検証した。利用者承認により遅延・完了時間の悪化10%以内を許容し、固定upstreamのcache最新IDより新しい一覧欠落も例外に含めた。保存済み24-runの再評価は正しさを受理したが、warm投稿p95とcoldのqueue滞留2指標が採用条件を満たさない。計画全体は未完了。2026-09-23、利用者判断でB/C/Eと不具合修正を性能採用判定から切り離して出荷し、D2/D3は出荷後の原因調査として継続する。公式固定 upstream の例外は下記の承認範囲に限定し、新規退行・既知不具合の悪化は許容しない。開始 revision は `1dba6556aad3f2ebf0b6fcde3f901c5ab1631874`。チェックボックスは実装と検証の完了時だけ更新する。

## 目的と前提

性能強化、保守運用の容易化、機能追加の容易化を目的に、内部の責務と実行経路を整理する。まだ運用のための公開前であり、内部の破壊的変更と旧互換の廃止を許容する。一方、既存テストが守る挙動、upstream Misskey との連合、認証・公開範囲・データ整合性を維持する。

本書は実装計画と実行記録を分けて管理する。以下の事前調査はソース読取、workspace 依存解析、連合構成解析、Bun バージョン確認までの記録。着手後の実通信・障害注入・比較結果は「実行記録と保留条件」に記載し、未検証の性能効果を成果に数えない。

## 変更可能な境界と保護する契約

| 対象                                 | 方針                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 内部関数・型・ディレクトリ・設定形式 | 必要なら破壊的変更する。全利用箇所を移行し、旧 alias・shim・二重実装を残さない                                                     |
| fork 内の REST API・SDK・UI          | 必要なら同時変更する。型生成と全呼び出し元を揃え、意図した挙動変更を先に記録する                                                   |
| ランタイム分岐・互換処理             | 現在の保持理由を確認し、実依存を移してから削除する                                                                                 |
| 既存テスト                           | 守る挙動と検出能力を維持する。内部実装への依存は等価な利用者観測へ置き換え、削除や skip で回帰を隠さない                           |
| ActivityPub と upstream 連合         | actor/object URI、署名、宛先、公開範囲、Follow/Undo/Delete/Move 等の意味を維持する                                                 |
| 認証・認可・非漏洩                   | 性能スコアから独立した採用条件とする。高速化のために検査を省略しない                                                               |
| transaction・再配送                  | 永続化の原子性、回復、冪等な最終状態を維持する。外部配送に exactly-once を約束しない                                               |
| 既存データ・migration                | 未公開でもデータ削除や DB 初期化を暗黙に許可しない。マージ済 migration は変更せず、必要な schema 変更から新規 migration を生成する |

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

A の基準結果と既知失敗の範囲を固定した後、B と C の調査、E の独立した UI 作業は並行可能。同じ composition root や投稿ファイルを同時編集しない。共有部分は統合担当を決めて順に切り替える。性能比較は同じ DB・ホストを使う別の負荷実行と重ねない。

### A. 回帰・連合・性能比較の基準を固定する

対象: backend の unit/e2e/federation、frontend/SDK の既存テスト、連合 compose と CI、既存計測スクリプト。

- [x] A1: 実行ランタイム、依存 lock、DB/Valkey、データセット、設定、開始 revision を固定し、既存テストの基準結果を取得する。失敗・skip・環境不足を区別し、未実行を成功と扱わない。
- [x] A2: fork ↔ fork を維持し、fork ↔ 独立 upstream を追加する。初回実装時に対象 release/commit と image digest を固定し、対象バージョンを記録する。peer ごとの DB・設定・成果物を分離する。
- [x] A3: upstream のアカウント作成等の差はテスト driver に閉じ込め、同じ意味のシナリオを双方の送信役で実行する。実際に検証した revision と方向だけを互換性の保証範囲とする。
- [x] A4: 公開範囲、署名、取得経路、障害後の再配送について、下記の不足を既存 fixture を再利用して補う。CI は連合に関わる lock/runtime/native 依存変更でも起動するよう対象条件を見直す。
- [x] A5: 投稿・タイムライン・連合配送の before/after 手順を用意する。数値の採用基準と正しさの判定方法は、候補実装を測る前に固定する。

受け入れ条件:

- actor 解決、Follow/Accept/Undo、投稿と添付、返信、Reaction/Undo、Announce/Undo、Delete、プロフィール Update、Move/alias と follower 引継ぎを固定 upstream との両方向で確認する。
- public/home/followers/specified/localOnly の許可宛先への正しい表示と、未許可宛先への非漏洩を同時に確認する。push だけでなく未署名/署名付き取得、outbox ページ、featured、private parent の露出も対象にする。既存仕様にない一律拒否で成功させない。
- 正常な署名付き GET/POST が成立し、署名後の本文改変、actor/id/Host 不一致等は最終的な副作用を起こさない。HTTP 202 のみを処理成功と数えない。
- 配送先の一時停止・復旧、および相手処理後の応答喪失・再送で、代表的な Note/Follow/Reaction/Delete の状態が収束する。再試行可能な障害と恒久失敗、dead-letter、削除 coordinator の契約を維持する。
- 否定判定を短い固定 sleep だけに依存させない。対象処理の進行・完了と受信側の最終状態を観測する。
- 既存テストが守る契約と追加した安全性条件が成立する。下記で承認された公式固定版の既知失敗だけを完了条件の例外とし、環境不足・未実行・新規失敗を保護済みと扱わない。

既知 upstream 失敗の扱い（承認済み）:

- 公式 image・release・commit は維持し、既存 assertion の緩和、失敗条件の削除、新規 skip は行わない。失敗した試験は report でも失敗として残す。
- 公式固定版で観測済みの Move、解除後の Follow / Reaction、凍結解除後の actor 再解決、重複 Accept の再試行とその残留による後続 barrier 失敗について、解消そのものを今回の完了条件から外す。機能未対応と原因未確定の区別は実行記録に残す。
- 固定版の再起動後に、保存済み投稿が`users/notes`のtimeline cacheから欠ける不具合も追加承認した。一覧の失敗と欠落ID・件数は残し、送信側の期待集合と受信DBの全件一致、重複・漏洩なし、同じviewerによる全件の直接取得を必須にする。元の観測期限後も続き、欠落IDが固定peerの永続cacheに存在せず、その最古IDより新しい場合だけ例外とする。cache範囲内に加え、最新IDより新しい欠落も承認対象とした。最古ID以前の欠落・保存欠落・別原因・証拠不足は拒否し、例外runも全測定へ含める。
- 変更前後で方向、シナリオ、保存状態、エラーと残留ジョブを照合する。失敗数やテスト名の一致だけでは同じ既知失敗と認めない。新規失敗、別原因の失敗、既知失敗の悪化は採用を止める。
- fork 同士の検証と、公式版で成立している連合・認可・公開範囲の契約は引き続き維持する。性能・資源の採用閾値も変更しない。
- A3/A4 の完了は、この例外を明示した基準・比較手順の検証を意味する。公式固定版との全件成功や、未達機能の互換性保証を意味しない。

### B. 投稿処理の責務と後処理の所有権を整理する

対象: `packages/backend/src/server/rest/note/notes-create.ts`、AP 投稿入口、予約投稿 handler、queue handler、`QueueOutboxStore.ts`、runtime の終了処理。

- [x] B1: 挙動を変えずに、HTTP の検証・エラー変換・レスポンスと、共通の投稿処理を分離する。HTTP/AP/予約投稿/queue の全 caller を移し、旧 export を削除する。
- [x] B2: 既存の投稿入力・transaction 拡張点を利用し、queue の入口を Bull.Job ではなく業務入力へ変換する。新しい DI コンテナ、汎用 repository、汎用 event bus は導入しない。
- [x] B3: inline・遅延 drain・worker の claim、実行権限、完了・失敗処理を共通化する。実行前の所有権確認、lease 超過、古い実行者による完了処理、stage 冪等性を一つの設計として扱う。
- [x] B4: drain と終了処理を runtime の所有に置き、正常終了時の待機上限・未完了処理の回復と、crash 後の再実行を定義する。

受け入れ条件:

- note/poll/集計/outbox の原子性と、予約投稿の draft ロック・revision 再検証・投稿・削除の原子性を維持する。
- 作成直後のタイムライン参照と、作成時点の antenna 判定に関わる順序を維持する。全面非同期化で応答だけを早めない。
- lease より長い待機・処理、worker との競合、再実行、途中停止で、通知・集計・timeline 等の選定した副作用が重複しない。
- analytics のような非冪等加算を、根拠なく durable retry に載せない。
- 正常 shutdown での待機と強制停止後の回復を別々に検証する。Pub/Sub の到達保証を outbox の保証に読み替えない。
- 責務移動の変更で性能向上を主張しない。後処理方式の変更は A の計測で応答時間と完了時間の両方を評価する。

### C. 不要な runtime 分岐と DB 依存を削減する

対象: `boot/server.ts`、HTTP/streaming adapter、test-server、`runtime-dependencies.ts`、`drizzle.ts`、`db/bun-sql.ts`、fixtures、CLI、migration runner。

- [x] C1: e2e 制御サーバーを Bun HTTP へ移し、共有 streaming 処理を transport から分離する。その後 Node 専用サーバー分岐を削除する。テスト用 WebSocket client 等の残存利用を巻き込まない。
- [x] C2: 本番 runtime からテスト専用 pg pool 所有を切り離す。DB fixture・CLI・直接接続を使う競合テストを、同等の契約を守る実装へ順次移す。
- [x] C3: migration の専用接続・排他・journal・失敗 cleanup を維持して DB 依存を移行する。request driver 変更とは別の変更にする。
- [x] C4: 固定 Bun 版で query/transaction 混在と接続予算を検証してから、pg fallback、driver 切替、pool 分離、互換型・値変換の廃止可否を個別に決定する。実依存がなくなったものだけ削除する。

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

- [x] D1: 同じデータ状態と負荷で基準値を取り、支配的な待ち・CPU・メモリ・IO を特定する。transaction 内も含めた DB 負荷を観測する。
- [ ] D2: 一つの原因に対する候補を実装し、正しさの条件を先に通す。before/after を交互に複数回実行し、生の結果と失敗を保存する。
- [ ] D3: 応答、非同期完了、資源上限のすべてを評価して採否を決める。採用候補だけ残し、旧経路と使い捨て測定コードを除去する。再利用する測定手順は残す。

測定と独立した観測:

| 経路         | 記録する指標                                      | 性能指標とは別に確認する内容           |
| ------------ | ------------------------------------------------- | -------------------------------------- |
| 投稿         | p50/p95/p99、成功/失敗数、DB 待ち、後処理完了時間 | 本文、公開範囲、集計、通知、重複       |
| timeline     | 取得時間、DB 往復、CPU、メモリ                    | 投稿集合、順序、ページ境界、非漏洩     |
| 連合         | queue 待ち、配送完了時間、再試行、最古未処理 age  | 相手の保存結果、署名、重複収束、Delete |
| 高負荷・終了 | RSS、CPU、接続数、滞留の増減、終了時間            | 取りこぼし、復旧、未完了処理           |

受け入れ条件:

- 閾値、比較回数、データ初期化、warm/cold 条件、許容する挙動変更を候補測定前に固定する。結果に合わせて後から緩めない。
- 正しさが不成立の候補は性能にかかわらず不採用とする。
- 応答短縮の代わりに無制限の滞留・接続・メモリ消費を増やさない。平均や単一スコアだけで採用しない。
- エージェント起因の起動失敗・壊れた出力を欠測として除外しない。環境要因で除外した実行も件数と理由を残す。
- 「速くなった」は対象経路、Bun/DB 版、データ、回数、未観測の範囲、正しさの結果と併記する。未測定の効果は成果に数えない。

### E. フロントエンドの通信・状態・描画の境界を整理する

対象: main/embed/SDK の API transport、query、Pinia/preferences、Paginator、`MkStreamingNotesTimeline.vue`。

- [x] E1: main/embed/SDK の共通 HTTP 契約を定義し、通信処理の重複を削減する。認証、匿名通信、cache/invalidation、AbortSignal、multipart、error の意図的な差を明示する。
- [x] E2: データごとに Pinia/preferences/query/Paginator の所有者と保存・同期先を決め、重複する責務を移行する。全状態を単一 store に押し込まない。
- [x] E3: timeline の描画と、HTTP 取得・stream 購読・新着保留のライフサイクルを分離する。旧取得・保存経路を残さず caller を切り替える。

受け入れ条件:

- 実ブラウザで main/embed、ログイン/ログアウト・アカウント切替、複数タブ、永続化の復元、offline/通信失敗を確認する。
- cache と保存状態がアカウント間で混ざらず、匿名 embed に認証情報を渡さない。設定同期の read-modify-write を変更する場合は複数端末の競合も検証する。
- timeline の初回取得・ページング・filter 変更・再接続・polling 切替・新着保留/解放が同じ投稿集合と順序を保つ。
- route 移動・unmount・再接続で購読、timer、非同期取得が残らない。仮想化、スクロール位置、keyboard 操作、フォーカスも実 UI で確認する。
- Service Worker の通知操作・アカウント選択・遷移と、embed の親 window 連携を維持する。

## 各変更の共通完了条件

1. 変更前に維持する契約と、意図的に変える契約を記録する。該当する backend/frontend の開発規約を読む。
2. 既存の実装パターンを使い、exported symbol の参照と全 caller を確認して切り替える。互換 alias、旧 code path、不要依存を最終状態に残さない。
3. 近い既存テストで検証し、最後に既存スイートと連合検証を実行する。公式固定版は A の承認済み例外を区別し、新規退行がないことを確認する。恒久テストは現実的な回帰を検出するものに限定し、実装形状を固定するために増やさない。
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

## 実行記録と保留条件

### 固定した対象

- fork の開始 revision: `1dba6556aad3f2ebf0b6fcde3f901c5ab1631874`。基準 checkout の本体と、返信修正を適用した候補の成果物は分離した。
- テストの実行バイナリ: Bun `1.4.0`。開発端末の別バージョンを基準値の実行に混ぜていない。
- upstream: Misskey `2026.9.0`、commit `bd9eb7c77942ef11749a04e7a5f24bee935d764b`。
- image: `misskey/misskey:2026.9.0@sha256:13ea3b432adbe29bf3699da5c7c0bd54775a9c237339ea47c6ec220094dba59a`。release ref・registry digest・linux/amd64 image の revision label の一致を確認した。詳細は [upstream.json](../packages/backend/test-federation/upstream.json)。
- 公式 image への修正、別 release への差し替え、失敗する条件の削除・skip は行わない。利用者は、既知不具合を記録してその解消だけを完了条件から外し、B〜E の内部最適化を進める工程・受け入れ条件への変更を承認した。

### 得られた基準と修正確認

以下は開始 revision の基準結果であり、計画全体の変更後スイートの成功を意味しない。skip の「—」は、この集計記録に件数を残していないことを示す。

| 検証                        |       成功 | 失敗 | skip |
| --------------------------- | ---------: | ---: | ---: |
| root scripts                |          8 |    0 |    — |
| frontend                    |        582 |    0 |    — |
| misskey-js                  |         32 |    0 |    — |
| sw / i18n / icons-subsetter |  9 / 3 / 1 |    0 |    — |
| mfm-js / AiScript           | 190 / 3812 |    0 |    — |
| backend unit                |        814 |    0 |    — |
| backend local e2e           |       1725 |    0 |   13 |
| backend external e2e        |       1725 |    0 |   13 |
| 既存 fork ↔ fork 連合       |        102 |    0 |   10 |

既存連合の取得前には、テスト証明書の制約・leaf key の読取権限と、同一 IP のサインイン制限に達して無制限再試行する fixture の失敗があった。失敗実行は保存し、アプリの制限や既存 assertion を緩めず、fixture を直してから上表の結果を取得した。

追加した upstream シナリオの初回実行は 124 成功・12 失敗・10 skip。ここには後に修正した添付保存先の権限や返信 fixture の問題も含まれるため、12 件すべてを現在の製品不具合とは扱わない。修正後の追加スイート全体は未完了である。

fork が別作者のフォロワー限定親を参照して返信すると、upstream は親の取得が 404 になった時点で返信の保存を中止した。fork の配送ジョブ成功だけでは欠落を検出できなかった。親の閲覧対象に返信の宛先が含まれると判断できない場合は、既存の宛先判定で参照を省くよう修正した。同じ作者のフォロワー宛て返信では参照を維持する。

- `test/unit/server/activitypub/object-routes.ts`: 修正前は別作者のケースが失敗、修正後は 13 件成功。
- 固定 upstream と候補の実通信: 親・添付の非漏洩と返信到達を、フォロワー限定・指定公開の両方向で確認。対象 4 件成功。選択実行で除外された 30 件を成功には含めない。
- 比較 CLI の disposable marker: 不一致時に deployment の stop/reset/start 等を一切実行しない回帰テストが成功。
- 返信修正後の backend unit 全体: 120 ファイル、816 件成功。

署名・障害 fixture では、改変した HTTP Host と TLS SNI を分離し、接続先の証明書検証を維持した。応答喪失 proxy は、Bun の非同期 `ServerResponse.destroy()` が HTTP 200 を返す再現を得たため、受理時に保持した下流 socket を切断するよう修正した。socket 切断の probe は HTTP 応答なしで終了し、実連合でも同一 Note / Follow の応答喪失 2 回と復旧後の再配送を観測した。

この実行で、承認済み Follow に対する重複 Accept が fork の inbox に `No follow request.` の遅延ジョブを残す問題を発見した。後続ケースの完了待機も妨げるため、実行は中断して exit 137 と観測を保存した。fork の acceptance 34 件は成功したが、両 matrix 全体の成功には数えない。AP の Accept 入口だけを冪等にし、申請も承認済み関係もない場合の拒否を維持した。DB を使う回帰テストは修正前に失敗し、修正後の inbox-dispatch 24 件は成功した。

Accept 修正後の fork ↔ fork 全体は 166 成功・2 失敗・既存 skip 10。署名・障害回復 32 件と acceptance 34 件は成功した。残る画像配送と Follow 通知の fixture は短い sleep から配送完了 barrier へ切り替え、関連する drive・notification・block の 3 ファイルで 21 成功・既存 skip 2 を確認した。

続く全体実行は 165 成功・3 失敗・既存 skip 10。Pin の反映、リモート削除前の Follow / Accept の成立、投票更新に固定待機が残っていた。同種の連合待機を送信元指定の配送完了 barrier に統一し、状態を確認する既存 polling と skip は維持した。`localOnly` の拒否 assertion の await 漏れと、削除後の ID 一致を検査していなかった assertion も修正した。user・note の 2 ファイルで 40 成功・既存 skip 4 を確認した後、新しい専用 DB / Valkey で全体を実行し、11 ファイル・168 成功・失敗 0・既存 skip 10 を確認した。acceptance 34 件と署名・障害回復 32 件を含む。期待値の緩和、新規 skip、タイムアウト延長は行っていない。これは fork 同士の結果であり、固定 upstream の未達条件は解消していない。

全体実行の JSON は `/tmp/misskey-optimization.b7uTpY/baseline/packages/backend/test-federation/results/fork-complete.json`、直前の失敗結果は同ディレクトリの `fork-final.json`、部分確認は `fork-final-targeted.json` に保存した。fixture 統合後の `bun run lint` は成功した。

固定 upstream との署名・障害回復は 29 成功・3 失敗・skip 0。upstream → fork の Follow 応答喪失後、公式側に重複 Accept が 2 件残り、どちらも `No follow request.` で再試行していた。固定ソースの `acceptFollowRequest` は申請が存在しないとき、承認済み関係を確認せず拒否する。後続の Reaction・Delete も、この残留ジョブにより完了 barrier を通過できなかった。公式版は変更せず、3 件を未達として保持する。

Accept 修正後の backend unit 全体は 120 ファイル・817 件成功。先行実行では実行時の `PATH` から既存 ffprobe の配置先を外してしまい、音声判定 2 件が失敗した。配置先を戻した再実行で成功し、アプリの判定やテストの期待値は変更していない。

### 公式固定版の既知失敗と未対応部分

| 条件                                  | 観測と判断                                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Move / follower 引継ぎ                | 既存機能の不具合。fork から upstream のローカルアカウントへの Move で、upstream が移行先を `uri` で検索して失敗した。ローカルユーザーの `uri` が null であることと、ローカル宛てを処理する分岐の検索条件を固定ソースで確認した |
| ブロック解除後の Follow / Reaction    | 解除受信は実装済み。Undo(Block) 到着後も拒否が残った。API と inbox プロセス間のメモリ cache 失効漏れが原因として有力 [INFERENCE]。個別 cache 内容は未採取、TTL 経過後の成功は未検証                                            |
| 凍結解除後の actor 解決 / follow 復旧 | 通常の再解決処理の不具合疑い。canonical URI の明示再解決で、削除済み旧ユーザーの profile 取得エラーを観測。古い actor cache の利用が原因として有力 [INFERENCE]。旧 Follow 関係の自動復元を要求している試験ではない             |
| Undo(Delete) 受信                     | 固定版は凍結解除時に Undo(Delete) を送るが、受信分岐は未実装で未知の型として無視する。これは付随して確認した未対応部分で、明示再解決の profile エラーとは別の問題                                                              |
| 署名・障害回復スイート全体            | fork ↔ fork の 32 件は成功。固定 upstream との 29 件は成功したが、重複 Accept が公式 inbox で再試行を続けるため Follow 応答喪失と後続 2 件は失敗。全体を保護済みとは扱わない                                                   |

upstream の確認先: [ApPersonService](https://github.com/misskey-dev/misskey/blob/bd9eb7c77942ef11749a04e7a5f24bee935d764b/packages/backend/src/core/activitypub/models/ApPersonService.ts)、[CacheService](https://github.com/misskey-dev/misskey/blob/bd9eb7c77942ef11749a04e7a5f24bee935d764b/packages/backend/src/core/CacheService.ts)、[ApInboxService](https://github.com/misskey-dev/misskey/blob/bd9eb7c77942ef11749a04e7a5f24bee935d764b/packages/backend/src/core/activitypub/ApInboxService.ts)、[UserFollowingService](https://github.com/misskey-dev/misskey/blob/bd9eb7c77942ef11749a04e7a5f24bee935d764b/packages/backend/src/core/UserFollowingService.ts)。

### 比較手順の準備状況

[preregistration.json](../packages/backend/scripts/optimization/preregistration.json) に、cold/warm 各 5 回の交互比較（計 20 実行）、posting p95 の 5% 改善、他の latency の 5%・resource の 10% 以内の悪化上限、全正しさ条件の成功を事前登録した。cold はアプリプロセスの新規起動を意味し、OS/DB cache の cold を意味しない。性能改善を採用できる比較結果はまだない。

[compare.mts](../packages/backend/scripts/optimization/compare.mts) は次の順で実行する。

```sh
bun packages/backend/scripts/optimization/compare.mts prepare "$CONFIG" "$EXPERIMENT_DIR"
bun packages/backend/scripts/optimization/compare.mts run "$CONFIG" "$EXPERIMENT_DIR"
bun packages/backend/scripts/optimization/compare.mts report "$CONFIG" "$EXPERIMENT_DIR"
```

`CONFIG` は専用環境の JSON。`schemaVersion: 1`、`isolation`、`before`、`after` を指定する。

- `isolation`: `disposable: true`、絶対パスの `markerFile`、DB/Valkey の同一 snapshot を識別する `snapshotSha256`。marker の内容は `optimization-disposable:<snapshotSha256>`。
- `before` / `after`: `reset`・`start`・`stop`・`identity` の各コマンド（`argv` と絶対パスの `cwd`）、`expectedRevision`、`peers`、`observer`。reset は両 peer の専用データを復元し、標準出力に `{ "snapshotSha256": "..." }` を返す。start は復旧にも使うのでデータを初期化しない。stop は冪等で、対象アプリと worker を所有するものに限る。
- `peers`: 同一の 2 ホストについて `url`・`kind`（`fork` / `upstream`）・`adminTokenEnv` を指定する。認証情報は環境変数に置き、JSON に書かない。
- `observer`: `databaseUrlEnv`・`redisUrlEnv`・`applicationRole`・`queueKeys`。アプリとは別の読み取り用 DB role、`pg_stat_statements.track=all`、`track_io_timing=on`、deliver/inbox/db queue と Linux `/proc` の読取権限が必要。観測不能をゼロへ置き換えない。
- `identity`: [identity.mts](../packages/backend/scripts/optimization/identity.mts) に checkout、コンパイル済み設定、観測対象の全 PID を渡す。実行中の各バイナリの版と `buildSha256`・lock・設定の identity を返す。成果物 hash は entry だけでなく backend の分割成果物全体と slacc の実行ファイルを含む。entry 以外の成果物を一時的に追加すると hash が変わり、除去すると元に戻ることを確認した。

report は正しさ、観測値（`measurements`）、各実行の絶対上限（`limits`）、交互比較（`comparisons`）を分けて出力する。絶対上限の超過は数値を隠さず不合格として記録し、全実行の上限と比較条件が成立する場合だけ採用可能とする。欠測・統計リセット・不正な観測値は集計を拒否する。

実験記録のschema 2は、manifestへrunのmetadataと最終journal digestだけを置き、要求結果・正しさ・完了・sample・commandの更新を`runs/<id>.jsonl`へ追記する。終了seal、sync、closeが成功したjournalだけSHA256を公開する。reportはdigest、追記順序、最終metadata、予定した20runのID・round・label・condition・順序を検査してから再生する。記録失敗時も所有するapplicationを停止し、不完全なjournalや予定の重複を成功runへ読み替えない。

要求時間は前の記録を待ってからdispatchし、応答のparse完了までを測る。連合・drainの完了は記録前の観測時刻、shutdownはcommand実行時間を使う。周期sampleはmonotonicな予定時刻を使い、遅れた周期を連続実行して追い付こうとしない。非同期完了は最初に確認できた時刻による上界であり、相手のcommit時刻を直接測定した値ではない。

安全側での実行拒否と、snapshot 復元・正しさ判定・停止再起動・資源観測・report までの全手順を、同一バイナリの 20 実行の対照試験で検証した。A5 の手順整備は完了したが、性能改善の候補はまだ測定・採用していない。公式固定版の既知失敗は A の承認済み例外として記録し、B〜E を進める。失敗・部分実行は保存し、新しい実験ディレクトリを用意してから再試行する。

計測 workload 部分は専用の候補 ↔ 公式 upstream 環境で smoke を実行し、保存・非漏洩・timeline 集合と順序・件数・通知重複・remote push・Delete の 7 条件が成功した。投稿 40、timeline 80、連合用投稿 1、負荷投稿 80 のリクエストがすべて成功。snapshot 復元・終了再起動・resource sampling・before/after 比較はこの smoke の対象外で、性能改善は主張しない。初回 smoke driver の認証フィールド誤りと、fixture ユーザー名が 20 文字制限を超えた失敗も保存し、修正後の結果と区別した。

専用の比較環境では、実アプリと worker の PID・Bun/Node 版の取得、両 peer の停止、DB dump と Valkey RDB の捕捉・同一 hash での復元、データを消さない再起動、別 role による DB/queue/プロセス観測まで実行した。復元 SQL と観測 SQL をアプリの SQL に混ぜないため、アプリ・snapshot 管理・観測の DB role を分けた。再起動後の正しさ判定には、受信側の全ページから許可された投稿集合・本文・公開範囲・重複を照合する処理も加えた。負荷リクエストの応答後に graceful stop する手順であり、未完了ジョブが必ず残る時点の停止や強制 crash の検証とは扱わない。

同一バイナリを before/after に置いた初回対照試験は、20 件すべて失敗、除外 0、report は採用拒否となった。19 件は復旧後の投稿数判定 `141 !== 140`、1 件は fork の `docker stop` が 29 秒のコマンド期限に達した。fork と[固定 upstream の削除実装](https://github.com/misskey-dev/misskey/blob/bd9eb7c77942ef11749a04e7a5f24bee935d764b/packages/backend/src/core/NoteDeleteService.ts)は `notesCount` から削除分を差し引かず、試験側が累計投稿数と現存投稿数を混同していた。この比較の数値は性能判断に使わず、失敗を保存した。

累計投稿数と現存投稿を別に追跡するようモデルを修正した後、専用環境で snapshot 復元・投稿・削除・負荷・停止・再起動を通す smoke の 8 条件が成功した。累計 141 件、現存するローカル投稿 140 件、受信側に許可された投稿 134 件を照合し、受信側の 100 件を超えるページングも通した。この smoke は機能確認であり、20 回の比較の代わりにはしない。

次の事前登録 20 件も、snapshot 復元段階で全件失敗・除外 0 となった。Valkey 起動直後の接続拒否を待つ処理が Redis の文言だけを認識し、Valkey の文言を想定外エラーとして扱っていた。Valkey の文言へ修正し、失敗結果は保存した。アプリ停止は SIGTERM 後の実際の終了状態を期限内に観測する手順へ変更し、強制 kill・OOM・非ゼロ終了を成功扱いにしない。専用環境で両アプリの起動・正常終了を確認した。また、観測側が Redis 互換版 `7.2.4` を Valkey 版として記録していたため、`valkey_version` を使うよう修正した。実サーバーの INFO と修正後の observer は、ともに `8.1.9` を返した。

起動待ちと版の観測を修正した対照試験は 20 実行すべてで正しさ 8 条件が成功し、除外と資源観測の欠測は 0 だった。ただし、DB 接続の観測値は最大 60〜61 で、事前登録した上限 32 を超えたため採用拒否となった。上限は変更しない。初回 report は予算超過で集計も中断したため、測定不成立と予算超過を分けて数値・上限・不合格を出すよう修正した。

report 改修後の新しい事前登録でも 20 実行すべてで正しさ 8 条件が成功し、除外は 0。集計エラーなしで 20 件の測定結果・100 件の絶対上限判定・70 件の cold/warm 比較を出力した。全実行の DB 接続観測値 60 が上限 32 を超えたことと、比較条件の未達により `eligible: false`、report の終了コードは 1。正しさの成功を採用成功へ置き換えていない。同一バイナリの対照なので、通過した数値を含めて性能改善の成果にはしない。生の結果と report は `experiment-control-limits` の `experiment.json` と `report.json` に保存した。

### B/C/E の実装と境界確認

以下は Bun `1.4.0`、専用 PostgreSQL / Valkey とローカル Chromium による機能確認。比較負荷の結果ではなく、性能改善を主張しない。複数 Set-Cookie を返す製品 route は存在しないため、その条件だけは `Bun.serve` の実 listener による transport primitive の確認であり、製品 route の確認とは区別する。

共通投稿処理を `core/note/NoteCreationService.ts` へ移し、HTTP 入口は schema・入力・エラー・応答を所有する。queue handler は業務 payload と必要な進捗・最終試行情報を受け取り、Bull.Job の組立ては worker 境界に残した。投稿・予約投稿の transaction 境界は維持している。

outbox の inline 実行は SQL 行の所有権を確認し、fanout/antennas の worker 実行完了は SQL の `completed` を確認する。Bull への投入成功やジョブ消失を業務処理の成功に読み替えない。worker 終了は依存する DB worker / dispatcher を先に閉じず、inbox 等を drain してから停止する。SW Push の非同期 410 cleanup は stage transaction ではなく root DB を使う。

統合 unit は一度 823 成功・2 失敗となった。DB が作る `availableAt` と JS のミリ秒時刻の比較で eager 発行が行われず、後続の backlog 判定にも行が残った。ready 判定を DB 時計へ統一し、アプリ時計が遅れる回帰条件を加えて、122 ファイル・825 件の成功を確認した。

続く通常 e2e は 1722 成功・3 失敗・既存 skip 13。後処理が混雑時に worker へ渡され、worker を持たない HTTP 経路でリノート通知・stream 配信が残った。応答後の保持枠が埋まった場合は要求側で後処理を待つよう修正した。該当する users / streaming の 153 件、続く通常 e2e と external e2e はそれぞれ37ファイル・1725成功・既存skip 13となった。

runtime の DB 接続は Bun SQL の共有 pool 一つへ統一した。Node HTTP adapter、pg fallback、query/transaction 用の pool 分離、テスト専用 pool 所有を削除。pg は独立した計測 observer と連合 fixture に用途が残るため devDependency に移し、実行されなくなった pg 用 telemetry instrumentation は除いた。Date・配列・SQLSTATE・rows/affected count の変換は保持する。型付き Drizzle の比較は一致したが、生 SQL では pg の timestamp が文字列・int8 が数値、Bun が Date・文字列になる差を確認したためである。

| 境界                     | 実行結果                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP + worker と接続予算 | 予算1/2/3で実投稿・timeline・export worker と並行 transaction を実行。観測接続上限は各予算以内、commit/rollback の混線なし、終了後0接続。別の SQL probe では予算5も確認                                                                                           |
| DB 値と回復              | Date/timestamp、int8、配列、JSON、bytea、更新/削除件数、競合、savepoint/rollback を比較。予算1の transaction 接続を実際に切断し、未commit行の不在・pool再接続・次transactionのcommitを確認                                                                        |
| migration                | 同時 runner の適用件数18/0、journal 18件のhash一致・未適用0。失敗SQLSTATE 22012でDDL rollback・journal不変・lock解放、再試行一回だけ適用。production resetは破壊前拒否、test resetでschema/journal消去。`check-migrations` は成功                                 |
| 実 HTTP / Unix socket    | OAuth discovery/認可/code交換/Bearer投稿、status/body/header、multipart保存と取得、固定/stream本文上限、upload中断後の部分保存なし、Unix権限600・認証通信・終了時socket除去を確認                                                                                 |
| 実 WebSocket             | 不正token拒否、認証購読、unsubscribe、再接続、payload超過1009、listener数復元、匿名へのspecified投稿非漏洩を確認                                                                                                                                                  |
| 処理中の正常終了         | 実transaction・投稿・export・WSがある状態で正常終了と再起動を実行。受理済投稿・durable exportの残存と再開を確認。強制crashの証拠とは扱わない                                                                                                                      |
| 強制停止とlease          | 本番のownership関数・実DB・Bullを使う別processを、30秒lease超過中とqueued実行中にSIGKILL。処理中の行は別publisherが奪わず、停止でSQL加算はrollback。期限切れclaimの再発行、古いtokenの実行/解放拒否、再実行2回でもcommit加算1回、SQL完了確認後のoutcome除去を確認 |
| transport primitive      | 2本のSet-Cookieを別々のraw headerとして取得。低速受信中にstream生成が64 chunkで停止し、受信切断でcancelを観測。製品routeは単一cookieの `/flush` を別に確認                                                                                                        |
| SDK/main/embed HTTP      | SDK 36件・型テスト成功。実ブラウザでGET/POST/multipartのcookie省略、token優先順位、明示匿名、AbortSignalを確認。実embed iframeのAPIにcookie/tokenなし、親windowとのready/iframeId/高さ通知を確認                                                                  |
| main の状態と timeline   | ログイン・端末内の全保存を消去するサインアウト・再ログイン・アカウント追加/切替、2タブとaccount別設定復元、offline時のエラーと復帰を確認。ページング36件・filter・新着保留とkeyboardでの解放・polling切替を実操作                                                 |
| KeepAlive の休止/再開    | 非表示routeへの移動で進行中fetchのAbortSignal発火とhomeTimelineのdisconnectを確認。共有channelの既存3秒猶予とmain購読は維持。休止中の投稿を復帰時に取得し、3投稿の画面内Y座標が変わらないことを確認                                                               |
| 通知のaccount境界        | SWとloginId遷移の旧IndexedDB `accounts` 読取りを廃止。Pinia deviceのaccountTokensを正本とし、同一hostだけを選ぶ。実Chromium workerでBobを選択中のAlice通知からAliceのrenoteを1件保存。実UIのloginId付き遷移でAliceへ切り替わり、対象投稿を表示                    |

通知のOSクリックはこの環境では操作できず、Chromiumに実通知を表示してscript生成のNotificationEventで操作した。このeventの`waitUntil`はブラウザが拒否するため、OSクリック時のworker寿命の証明ではない。workerの実HTTPと保存結果、アカウント別遷移は確認した。SWの保存先回帰・別hostへのtoken非流出・サインアウト後の旧token不使用は恒久テストでも検証した。

frontend全体は103ファイル・584件、SWは4ファイル・10件成功。frontendとSWの型検査・buildも成功した。実ブラウザで見つかったView Transitionのready拒否を処理し、描画中止でも未処理拒否がなくテーマと画面が更新されることを確認した。

強制停止probeの初回は、待機をPostgreSQLの`pg_sleep`内へ置き、SIGKILL後の即時再発行assertionが失敗した（全体90.53秒）。待機を実行process内へ置いた再実行では上記の回復を確認した。選定した副作用は隔離したSQL加算であり、投稿/fanout自体はe2eで別に確認している。生結果は `outbox-crash-proof.json` に保存した。

機能 probe の生結果は `/tmp/misskey-optimization.b7uTpY/` 配下の `sql-value-final-probe.json`、`sql-reconnect-proof.json`、`migration-contract-probe.json`、`runtime-native_full/proof-probe-1788943067434.json`、`native-listener-edge-proof.json`、`browser-transport-proof.json`、`frontend-native-ui-proof.json`。初回 OAuth fixture は許可されないローカル接続先、次は長すぎる client_id を token 名に保存できず失敗した。製品の接続先検証や DB 制限を緩めず、公開 metadata の短い fixture で成功を確認した。

統合時の `bun run lint` はoxlint・format・Vue template 629件・文書リンク70件・指示同期・Playwright型検査・全workspace型検査まで成功した。APIのmeta/paramDef/resは変更しておらず、SDK自身の追加APIはbuild・型テスト・API Extractorで確認した。outboxのstateは既存text列の値を追加したものでDDL変更はなく、既存migrationの未適用0を確認した。

最終backend unitは、検証コマンドでPATHを狭めてffprobeが見えなくなり2件失敗、次にtmpfsのquota超過で117 suiteがcompileに失敗した。PATHは既存のffmpeg導入先を残し、所有する連合検証artifactを通常filesystemへ移した。assertion・対象を変更せず再実行し、122ファイル・825件成功となった。どちらの失敗も成功runから除外した測定値ではなく、失敗した検証試行として残す。

### 固定公式版との最終比較

最終の全連合matrixはfork同士が168成功・0失敗・既存skip 10、固定公式版が108成功・23失敗・既存skip 47。各assertionの成否は承認済み基準と一致した。fork終了後のquota超過で公式側の結果が得られなかった試行を残し、完全なfork reportのhashと成功receiptを検査する一時runnerから、公式側の全178件を再実行した。テストfilter、assertion、skip、公式pinは変更していない。結果と停止前のSQL・Valkey・peer logは `final-federation/run-20260909T090355Z-025a3da0/fork/` と `final-federation/run-20260909T095553Z-28c70dde/upstream/` にある。保存状態・エラー・残留ジョブの照合は、成否の一致とは別に評価する。

基準側の停止済みattached composeとは別に、依存するapplicationが稼働を続けていた。両applicationをpauseして既存DB・Valkeyを読み、停止後も残るapplication logを取得した後、project全体を停止した。この基準の状態取得は試験終了直後ではないため、retry回数・遅延から失敗への進行を同時点比較に使わない。失敗時のqueue件数は元report、保存効果とjobのactivity・理由は追加の `approved-baseline-late-state/` を使い、時点差を残す。初回compose log取得の環境変数不足も、回復したlogとは別に保存した。

方向とactorの役割をURI・activity・保存関係で対応付け、次を照合した。ランダムなuser IDの一致や失敗数だけには依存していない。

| 失敗群・方向                                           | 基準と最終で共通する保存状態・エラー                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move、A→Bのローカル移行先                              | aliasとmovedToは保存。A側followerの移行は成立するが、B側followerは旧sourceをfollowしたまま。公式のlocal destination URI検索で同じ`EntityNotFoundError: MiUser`。legacy Moveでもdestination follower 0・旧source follower 1、完了jobの`skip: nothing to do`が一致 |
| 凍結解除、A/B両方向の再解決                            | Bは同じcanonical actorを新IDで再作成済みだが、`ap/show`が削除された旧IDのprofileをpackし、同じ`EntityNotFoundError: MiUserProfile`を2回返す。Aには双方向follow、BにはA→Bだけが残る。旧IDがpackへ渡る内部原因は未確定                                             |
| 応答喪失Follow、B→A                                    | 両peerに同じ関係が1件、pending requestなし。送信Followは3試行後にcompleted/Success。同じFollowを内包する異なるAcceptが2件、公式で`No follow request.`を繰り返す。Follow試験自体はtimeoutのままで、正確に中断したawaitは未確定                                    |
| 応答喪失Reaction/Delete、B→A                           | 同じ先行Acceptによる準備barrier失敗。Reactionは元noteの両peer保存・reaction 0、Deleteは準備follow成立・削除対象note未作成。Like/Deleteを送信した後の失敗とは数えず、この方向の意図した障害操作は未検証のまま                                                     |
| sensitive返信・abuse転送、A→B                          | 正しい親を持つ返信とJPEG1件のsensitive=true・同じmd5/寸法、正しい対象とsystem.actor reporterの転送reportをそれぞれ保存済み。試験はtimeoutであり、後続assertionを通ったとは扱わない                                                                               |
| 通知を起こすFollow/Like/返信/renote/quote/mention、B→A | 関係1件、reaction1件、正しい親・authorの投稿効果が保存済み。次のFollowは双方でalready-following。通知helperはtrigger後にbarrierを待つ。通知event自体の保存証拠はなく、通知成功には読み替えない                                                                   |
| Block/Undo、AがBをblock                                | 同じpairでBlock/Undoが処理され、解除済pairにはblock・follow・投稿効果がない。remove-followerの成功pairとmention用pairだけblockが両peerに残る。多くの失敗は操作前barrierを持つtimeoutで、許可・拒否APIまで到達したとは扱わない                                    |

失敗時reportのB inboxは双方ともdelayed 2・failed 3、Reaction/Delete時のproxy進行も一致した。遅い基準snapshotでは同じAccept2件が8試行後failed、最終直後では6試行後delayedであり、時点差による進行を性能差や悪化とは数えない。他の残留は、両方向の署名否定試験が作ったLike拒否、先行するremote-deletion試験が意図したFollow拒否、逆方向Moveのalready-followingで一致した。remote-deletionのFollowを凍結解除失敗へ誤って対応付けた初期分析は、実際の`ap/show` URIとprofile IDで訂正した。

公開範囲5種、署名付き/未署名取得、outboxページ順序、featured、private parent/添付の非漏洩、正常署名と6種の改変拒否は、同じassertionで両方向成功した。一時停止4操作は両方向、応答喪失4操作はA→B、応答喪失NoteはB→Aで成功。上表の未達を除き、今回照合した保存効果・エラー種別・残留activityに新規退行や悪化は観測しなかった。[INFERENCE] 後続の一般timeoutは同じ遅延Acceptとbarrierの位置に整合するが、全timeoutの中断箇所をtraceした証明ではない。

比較用に展開したreport、actor/関係、queue membership、application logとAPI例外の証拠は `/home/haru/.cache/misskey-optimization.b7uTpY/official-comparison/`。A3/A4の完了は承認済み例外を残した比較の完了であり、公式版との全件成功、未送信の障害操作、通知eventの成功を意味しない。

### D の比較準備

先のsame-binary controlは20/20の正しさを満たしたが、全runで60接続を観測し、固定上限32を超えた。投稿/loadのtailとSQL実行の集計は得られたものの、特定のSQL・CPU処理・pool取得待ちを支配的原因と断定できる計測ではない。

B/C全体の比較とは別に、pool分割だけの対照を用意した。現行buildの1652個のsource map入力と比較し、`src/db/bun-sql.ts`だけが異なることを検証した。対照はprocess予算を通常queryとtransactionに分け、現行は共有する。予算1はどちらも共有し、SQL値変換・HTTP・投稿・queueは変えていない。両方式の予算1/2/3で、それぞれ通常query32・commit24・rollback8と接続上限・終了後0接続を実DBで確認した。対照の旧分割は一時artifactだけにあり、製品sourceへ戻していない。

比較は両labelとも同じpool上限16に固定する。B/C全体を5反復×cold/warm×before/afterで評価し、pool単独は未測定の対照候補にとどめる。Dの対象は以下の実測から選ぶ。元の閾値、同一config条件、正しさ、完了時間、資源上限、失敗保持は変更しない。異なるconfigの60→16比較をDの完了や採用根拠にはしない。

準備したhelperとsource対照の証拠は `/home/haru/.cache/misskey-optimization.b7uTpY/candidate-comparison/`。tmpfsのquota超過を避けるため、未封印の出力先を通常filesystemへ移した。既存のcontrol snapshot本体・所有者検査・hash検査は変えていない。

比較の起動では、`experiment-bc-final` の20runがread-only native mount配下の空mountpoint不足と異常終了guard、`experiment-bc-mountfix` の20runが公式peerの異常終了guard、`experiment-bc-ready` の20runがproxy停止によるdriverのDNS timeoutで失敗した。いずれも負荷開始前でsampleは0。計60runを失敗として残し、除外0・不採用のreportを作成した。空mountpointの追加、同じcontainerの正常起動/終了、driver再作成を監視していた旧composeの終了と通常supervisorへの移行でfixtureを修正した。image・container ID・snapshot bytes・終了guard・閾値は変えていない。proxyだけの起動は未起動backendの名前解決で失敗したため、依存backendがhealthyになってからproxyを起動した。

その後、実driverから両peerのDNS・TLS・`api/meta` HTTP 200と、guard付きの両application停止/再起動を確認した。別の静的確認で、計測器が新しい`completed` outbox outcomeを未処理件数と最古ageへ加えていたことを見つけた。恒久回帰テストで未完了6件に対して10件と数える失敗を再現し、完了記録を残したまま未完了6件・全完了後0件となるよう修正した。rawのstate別件数・ageは残す。dead-letter/failed queue拒否や数値閾値は変更していない。

回帰テストからobserverを型検査対象へ入れ、ZRANGEの文字列boundと、要求順序どおりのnullable timestamp/counter変換も型に合わせた。focused testとbackend testの型検査は成功した。修正前harness全体は `harness-before-completed-outcome/` に保存済みで、失敗済み実験を改変せず、修正後harnessを新しい実験名で封印する。これは計測器の完了判定修正であり、製品の高速化ではない。

続く`experiment-bc-observed`も20runすべてがsample前のidentity取得で失敗した。hostからの確認は通ったが、再作成したdriver内で公式Nodeの実行ファイルを`/proc/PID/exe --version`として実行すると、`libatomic.so.1`不足でexit 127となった。固定公式peerから同じlibraryをdriverへコピーし、両ファイルのSHA256 `9558489f171274c220104894258f483055853ed8a23d4ff754c850ce55765aa2`の一致と、実際のdriver内で全対象processのversion取得を確認した。applicationのimage・runtimeは変えていない。ここまでの計80runは失敗・除外0のまま保存した。

実driverで未測定のseed/observer smokeも実行し、3回のdrain観測、16個の実queue hash、nullable timestamp/counter、pending 0を確認した。続く`experiment-bc-driver`の20runは18成功・2失敗・除外0。基準側の`1-warm-before`と`3-cold-before`が停止再起動後の`load-shutdown-restart-no-loss`で失敗し、reportは不採用となった。HTTP要求の成功とqueueのdrainを、復旧条件の成功へ読み替えていない。

この実験の記録は291,151,275 bytesに達した。実driverで同じ全履歴を5回保存する診断では、保存全体の中央値が1,979.964ms、うちserializeが1,392.701msだった。旧版が保存していたのは要求ごとではなくsample・check・commandの境界だが、その停止時間が後続の観測へ入り込む。したがって、この20runの数値は正しさ失敗に加えて計測介入の理由でも性能採用に使わない。

追記式記録の最終版を、旧記録の1runで5回再生した。各回252 checkpoint・6,917,064 bytesとなり、全5回で元のrunへの完全な再生と同じdigestを確認した。sample保存100件のp95は0.893ms、closeは3.021〜95.055ms。先の診断で出た要求checkpointの最大48.904msやcloseの48.000〜137.331msも残す。異なる保存単位・時点の診断であり、これを製品の高速化率へ換算しない。

実CLIの最初のmanifest保存へEISDIRを起こす試験では、旧版はexit 1後も両applicationが稼働した。修正版は同じ失敗後に両applicationをexit 0で停止し、未確定journalを含む20runのreportを除外0で拒否した。予定runを重複させたreportも拒否した。実ファイルを使う恒久テストでは、重なるcheckpoint、command完了、sampleの置換、失敗証拠、未完了seal、journalの切り詰め・有効JSONへの改変を確認した。

旧harnessと全失敗試行を保存し、修正後の時計境界・記録・対照条件を`measurement-v3.json`へ固定した。新しいsame-binary controlは両labelを現行artifact・pool 16とし、`experiment-control-journal`で20runを実行した。負荷、閾値、snapshot、除外規則は変えていない。計測器の修正はDの製品ボトルネック改善へ数えない。

この対照も18成功・2失敗・除外0だった。`1-warm-before`と`4-cold-after`が受信側の復旧後投稿集合の確認でtimeoutしたため、採用拒否となった。両labelは同じ成果物なので、成功したlatencyを高速化の成果にはしない。

両失敗の134件すべてに、forkの配送成功、公式側のCreate受理と`Creating the Note`のlogが対応した。最後のlogは保存前の位置であり、保存成功の証明ではない。Follow処理とAcceptは最初の許可されたseed投稿より前に完了しており、追跡したforkの5ファイルもfrozen source mapと現行sourceが完全一致した。Follow成立待ちの不足という初期仮説は、この2件の説明として棄却した。

公式側では再起動後にinbox 15件・16件のstalledと再処理が観測されたが、旧記録は失敗時の受信page本文と公式DB/queueを保存していなかった。欠落IDや保存とlistingの違いを確定できないため、次の5回では最終page、公式DB、timeline cache、inbox状態を停止前に取得した。5回とも正しさ8条件は成功し、元の2失敗は再現しなかった。snapshot・要求数・正しさ条件は同じだが、周期samplerの待ち合わせを省き、観測を追加した診断なので性能比較へ流用しない。証拠は`diagnostics/control-failure-evidence/`と`recovery-observation-protocol.json`に分ける。

CPU計測の最初の3回は、起動用wrapperを通常の成果物検査が拒否し、負荷前に失敗した。失敗と元sourceを保存し、採用比較の検査は変更しなかった。次の3回はwrapperと元entryの完全コピーだけを許可する別のidentity検査を使い、他の成果物、config、image、container、実バイナリを照合した。Bun `--cpu-prof`のworkerへの継承とepoch microsecondの時刻は実processで確認した。全回で元の成果物を復元した。

このCPU診断は2成功・1復旧失敗だった。失敗した`warm-v2-3`では公式DBに134件、APIに133件があり、欠けた`optimization-post-5`はcache最古IDより新しいのにcacheへ含まれていなかった。同じviewerの`notes/show`では取得できた。専用環境でそのtimeline keyだけを除去するとAPIは134件、元の116要素を同じ順序で復元すると再び133件となり、全段階でDBの投稿行は不変だった。これは固定upstreamのcacheを使うlistingの欠落であり、この回の保存欠落ではない。元の対照2失敗まで同じ原因と断定しない。cacheは復元し、失敗条件も緩めていない。証拠は`diagnostics/receiver-cache-aba/`。

全6 CPU profileをfrozen source mapへ対応させた。measureのsampleは645/654/647、loadは530/578/519で、約半数はURLを持たないframeだった。loadの`postNoteCreated`を含むstackは35/50/45 sample、全体の6.60〜8.67%で、単独の製品関数がCPUを支配する結果ではなかった。sample間隔の空白をCPU時間へ換算せず、同時の背景処理も含むVM stackの分布として扱う。失敗した3回目も除外していない。

同じ3回のSQL差分はreset/deallocationなし、query ID重複・欠測・減少なしだった。measureではinline outboxのclaim・delete・insertの3 SQLが実行時間合計の34.78〜36.85%、533呼出しを占めた。loadでは80回の投稿者counter更新が52.33/80.08/81.02%を占めた。BEGIN/COMMITは多数だが、`pg_stat_statements`の実行時間では各phaseの合計が0.60ms未満だった。この値はcommitのWAL永続化、pool待ち、network往復、要求のcritical pathを表さない。shared block readとtemp writeは0だが、WALや全IOが0という意味ではない。詳細は`diagnostics/sql-attribution.json`と`cpu-attribution.json`。

さらにCPU profilerなしの同じ負荷を3回実行し、25ms間隔で待機とblocking PIDを観測した。正しさ8条件は全回成功。111/125/68 sample中26/30/15 sampleにLock待ちがあり、90件の待機観測は全て投稿者counter更新のtransactionid待ちだった。87件はblocking sessionがCOMMIT中のWALWrite/WalSync、1件はcounter更新後のidle in transaction、2件は取得時にblocking PIDがなかった。これは点観測であり待機時間の割合ではないが、SQL実行時間だけでは見えなかった永続化待ちを確認した。transaction境界やdurabilityを弱める変更は候補にしない。証拠は`diagnostics/lock-attribution.json`。

### D 候補の実装と計測器の終了境界

inline outbox の所有権取得を、同じ transaction 内の `SELECT FOR UPDATE` と `DELETE` から、状態・lease token 条件付きの `DELETE RETURNING` に置き換える候補を作成した。削除と副作用を同じ transaction に置き、失敗・SIGKILL では両方を rollback する。凍結した1652個のsource map入力のうち、変更は `QueueOutboxStore.ts` だけだった。queue/DBの26件、実processのlease超過・SIGKILL・古いtoken拒否・再実行時の加算1回、実HTTPの8つの正しさ条件を通した。性能改善はこの段階では未確定。

`experiment-inline-journal` は3成功・17失敗、後続の `experiment-bc-journal` は20失敗となり、どちらも採用不適格・除外0とした。最初の失敗は再起動後identity取得中の `/proc/.../exe` 消失、その次はsnapshot resetの180秒timeoutだった。`switch.lock` が残り、後続の停止まで拒否した。timeoutを封印した18:19:29Zより後の18:20:00Z以降にValkeyの停止・再起動logがあり、[INFERENCE] 親だけを終了してresetの子孫が継続したことと整合する。元の180秒を消費した待機箇所は特定できていない。read-onlyのhash・Docker inspect・snapshot全体の検査では停止を再現しなかった。

実CLIの短いtimeout用fixtureでは、旧処理は親終了後に子孫がファイルを書き、修正後は4本とも後続の書込みがなかった。コマンドを独立process groupで起動し、そのgroupを期限で終了する。switchの排他はinodeを削除しないkernelの`flock`に切り替え、競合拒否と所有processのSIGKILL後の再取得を実コマンドで確認した。snapshotの進行はstderrへ即時転送し、次の失敗でも親のbuffer内だけに残さない。

identityの所有範囲もcontainer initとその子孫に限定した。実コンテナに無関係なBun/Node execを1本ずつ追加すると、旧処理はfork 3・公式5 processを選び、修正後は元のfork 2・公式4を維持して追加分を除いた。所有PIDの消失、binary/version、container ID、再起動世代の検査は緩めていない。証拠は `diagnostics/command-timeout-proof.json` と `diagnostics/identity-ownership-proof.json`。失敗した40本と修正前のhelper/harness bytesは保存し、同じ実験名への上書き、cache消去、閾値変更、成功までの再試行は行わない。

進行記録を付けた次のresetも180秒で失敗したが、今回は最初の `pg_restore` が123.58秒で終了し、2つ目の実行中に期限を迎えたと分かった。hashとDocker inspectの停止ではなかった。復元を[PostgreSQL標準のsingle transaction](https://www.postgresql.org/docs/18/app-pgrestore.html)へ変え、各DBのschema・データを一括で復元する。DB側に以前のrestore sessionが残る場合は、変更前に拒否する。これは2つのDBをまたぐ原子性ではない。

変更後のresetは8.51秒で成功し、96コマンドと18回のhash処理の終了、同じsnapshot hashを確認した。これはreset fixtureの成立確認であり、製品の速度比較ではない。restoreと同じapplication_nameを持つ実SQL sessionを置いた確認ではresetを拒否し、既存データのmarkerが維持された。markerを元へ戻し、両PG18.6の`fsync`・`synchronous_commit`・`full_page_writes`がonのままであることも確認した。失敗と成功は `diagnostics/reset-recovery-proof.json`、`diagnostics/reset-atomic-proof.json`、`diagnostics/restore-guard-proof.json` に分けて保存した。

修正後の比較は `inline-ownership` と `bc-ownership` の各20本を直列に実行する手順として新規登録した。元の5反復・cold/warm・交互順序、snapshot bytes、採用閾値、全件の正しさ、除外0は維持する。`command-recovery-protocol.json` に修正理由と証拠hashを、`helpers-ownership/` に実行sourceを凍結した。

### B/C の性能判定と再設計

`inline-ownership` と `bc-ownership` は各20本すべてで正しさを満たし、除外0・絶対資源上限内だった。ただし、どちらも相対ゲートに不合格だった。以下はconditionごとのpaired ratioであり、label別中央値同士の比ではない。

| 比較                   | cold posting p95 比 | warm posting p95 比 | 判定                                                                    |
| ---------------------- | ------------------- | ------------------- | ----------------------------------------------------------------------- |
| current → inline-claim | 0.542               | 0.701               | 連合応答・load・SQL実行時間・queue待ち等の副指標13件が退行し、不採用    |
| approved → current     | 1.571               | 1.511               | 主指標と複数の副指標が不合格。database.calls比もcold 1.975 / warm 1.974 |

一件ずつの`DELETE RETURNING`候補は撤回した。利用者はB/Cを性能例外として受け入れず、元の基準を維持した再設計を選択した。失敗した比較、閾値、snapshot、公式固定版は変更しない。

B/Cの全20本をSQLごとに照合すると、before 28,713回に対しcurrent 56,652回だった。差27,939回のうち15,228回はBEGIN/COMMIT、12,100回はstageごとの所有権SELECT/DELETEと旧batch完了DELETEの差だった。これはseed/warm後の初回sampleから再起動後drainまでの集計であり、投稿要求だけのSQL数やlatencyへの因果寄与ではない。

再設計では、HTTP応答前のfanout/antennasと遅延stageを別の所有権batchにする。最初のbatchのcommitと失った所有権の実行完了を確認する前に応答しない。非冪等analyticsはdurable retryから分離したまま、一件上限のruntime runnerが完了を所有する。飽和・終了時は要求側で待つ。dispatcherのclaimも、queue別上限・行ロック・再調停後の即時再発行を維持してSQL往復をまとめる。これらは候補設計であり、性能改善の実測結果ではない。

再設計の最終sourceで、queue・prepared DB・durable境界の3ファイル33件が成功した。実processの2行batchでは、runtimeごとにSQL接続1本で、lease期限超過中の排他、SIGKILLによる2件の加算と削除のrollback、Bullへの引継ぎ、古いtoken拒否、再実行しても各加算1回、完了確認後のoutcome除去を確認した。証拠は`diagnostics/batch-ownership-smoke-formatted/proof.json`。

stageごとのtransactionを使う対照も作り、最終候補との1652個のsource map入力の差が`NoteCreationService.ts`だけであることを確認した。dispatcher・author snapshot・analyticsの配置・pool等は両者で同じ。`redesign-stage-batch-proof.json`に対照のsourceと構築手順を残し、`stagewise`と`redesigned`のartifactを凍結した。

採用比較前の実HTTP smokeは、stagewiseが8条件すべて成功した一方、redesignedは再起動後の受信側一覧で失敗した。公式DBには134件があるが`users/notes`は127件だった。欠けた7件は同じviewerの`notes/show`ですべてHTTP 200・同じ本文を返した。当該timeline cacheだけを外すと一覧は134件、元の114要素を同じ順序で戻すと127件となり、前後のDB投稿行はすべて不変だった。cacheは復元済み。これは一覧cacheに起因する欠落であり、この回の保存欠落ではない。証拠は`diagnostics/batch-native-after/proof.json`と`diagnostics/receiver-cache-batch-aba/proof.json`。

再設計前にも同種のcache欠落を1件観測しているが、今回の7件との差をforkの改変による悪化とも無関係とも断定しない。この時点では承認済み例外に含まれていなかったため、失敗したsmokeを失敗のまま残し、新しい20本ずつの採用比較を開始しなかった。

利用者はその後、この固定upstreamの一覧cache欠落に限って正しさ条件へ例外を追加する判断を承認した。再起動後の保存・全件直接取得と一覧確認を分離し、rawの一覧失敗は`known-failure`として記録する。reportの`correctness.passed`はraw全成功、`correctness.accepted`は承認条件込みの成立を表す。欠落ID・件数と全測定を残し、数値閾値・負荷・回数・timeout・snapshot・除外0は維持する。旧harnessとconfigは`helpers-before-listing-exception/`に保存し、旧結果を再分類しない。

再設計本体はfull unit 124ファイル・832件、通常e2eとexternal e2eはそれぞれ37ファイル・1725成功・既存skip 13で成功した。新しい例外判定・journal・observerのfocused 3ファイル11件とbackend型検査も成功。実fixtureでは送信DBから独立に求めた期待134件に対し、受信DBと同じviewerの直接取得も全134件を確認し、元の120秒の期限後も残る一覧127件・欠落7件を新しい判定が認定した。DB/cacheは変更していない。これは判定機能の検証であり、失敗した一覧や過去のsmokeが成功したという意味ではない。証拠は`diagnostics/recovery-contract/proof.json`。

実report CLIの合成fixture9条件では、raw失敗を残した例外runの全20測定が計算へ入り、保存不足・直接取得不足・不正証拠・必須check欠落・無関係な失敗は採用を拒否した。例外が認定されても、RSS上限、latency退行、主指標の改善不足をそれぞれ拒否した。これは`diagnostics/synthetic-report-regression-only-FnbMyv/`に保存した判定器の検証であり、製品の性能測定ではない。

新しい判定を使ったstagewise/redesignedの実HTTP smokeは、どちらも9条件がraw成功だった。独立した失敗fixtureによる例外経路の検証と、今回たまたま例外を使わず成功したsmokeを区別する。全体`bun run lint`も成功した。採用比較の事前条件として、これらのsource・config・harness・結果を固定する。

`experiment-batch-redesign`はraw成功16本・承認済み一覧欠落3本・通常失敗1本だった。通常失敗の`4-warm-before`は保存と直接取得が134件、一覧が121件で、欠落13件のうち1件が観測cacheの最大IDより新しく、固定した例外判定を満たさなかった。試行は通常失敗のまま保持し、比較を採用していない。

`experiment-redesign-ownership`は20本すべてraw成功・除外0・絶対上限内だったが、相対ゲートに不合格だった。database.callsのpaired比はcold 1.098 / warm 1.100まで縮まった一方、posting p95はcold 1.018で改善基準を満たさず、load p95はcold 1.537 / warm 1.430となった。SQL往復数の減少を統合した性能成果とは数えない。

### 投稿 runtime の統合

局所的なSQL変更ごとの比較反復を止め、同期必須処理・後処理の受付・有限の滞留・正常終了を一体で変更した。`NotePostProcessing`は実行中を含む64件までをFIFOで受け付け、一件が実行中という理由だけでHTTP要求へ全後処理を戻さない。満杯・受付終了時だけ要求側で待つ。受理済みは一件が失敗しても処理を続け、エラー通知自体が失敗した場合も受理済みを捨てず、受付を止めて終了時に失敗を返す。

HTTP listenerは新規受付とWebSocketを止め、処理中のHTTP応答を待つ。その後、runtimeが後処理をdrainし、chart保存とDB/Valkey等の解放を行う。終了失敗があっても残りの解放を省略せず、失敗を集約して返す。

実HTTP・WebSocketの一時smokeで、analyticsを保留したまま64投稿へ応答し、65件目は要求側で待機することを確認した。終了中も依存を保持し、保留を解除すると65件目の応答と全受理済み処理が完了した。応答前の自TL/antenna反映、投稿65件・集計65・未処理outbox 0も確認した。対象2ファイル25テストとbackend型検査は成功。証拠は`/tmp/misskey-optimization.b7uTpY/integrated-lifecycle-proof.json`。速度比較ではない。

統合版のfull unitは125ファイル・840件、通常e2eとexternal e2eはそれぞれ37ファイル・1725成功・既存skip 13で成功し、全体lintも成功した。実行artifactは`integrated`として固定し、採用比較はapprovedとの一つの20-runへまとめた。数値・正しさの採用条件は変更していない。

同じ固定artifactの全連合matrixは、fork同士が168成功・0失敗・既存pending 10、公式固定版が108成功・23失敗・既存pending 47だった。外側の実行コマンドが期限を迎えた後も既存coordinatorが動いていたため、同じprocessの終了を待って結果を回収した。matrixを再実行していない。証拠は`/home/haru/.cache/misskey-optimization.b7uTpY/integrated-federation/run-20260910T015736Z-0cbc5ac7/`。

公式版との全178件の個別statusは以前の結果と一致し、23失敗の理由・方向、残留queueのactivity・理由・試行数も一致した。非queue18テーブルの選択属性と参照関係の比較では、新しい欠損・公開範囲変化・保存重複を検出しなかった。これは全列や通知記録の完全一致の証明ではなく、既存のFollow request残留・counter非整合も残る。

ただし、公式BのHTML `/` のmeta取得中に、`system.proxy`作成が`used_username`の主キー制約で失敗する例外を新たに1件観測した。最終account行は1件だが、このHTTP要求の再試行成功は保存証拠では確認できない。承認済み23失敗へ吸収せず、新たな未解決観測として残す。公式Bのnote URI衝突も2件から3件になったが、追加対象は保存1行・対応renote1件・Create/関連deliver完了・失敗残留なしを確認した。追加衝突の頻度差と最終状態の退行は区別する。

### 統合版の採用判定

`experiment-integrated-consolidated`は全20本を実行し、raw成功16本・承認済み一覧欠落3本・通常失敗1本だった。通常失敗は基準側の`1-cold-before`で、受信DBと直接取得134件に対し一覧126件。欠落8件のうち4件がcache最大IDより新しく、固定した例外判定を満たさなかった。reportは`eligible=false`で、失敗を除外した採用計算は行っていない。

全20本の要求記録を使う補助集計でも、posting p50のpaired比はcold 1.181 / warm 1.204、warm load p95は1.266だった。正しさ不成立の試行を含む記述値であり、高速化の証拠ではない。これらも元の5%退行上限を満たさず、数値条件を緩めて採用する判断はしていない。補助結果は`diagnostics/integrated-descriptive.json`へ保存した。

この比較の後、追加の局所変更・計測ループを停止した。実装済みの有限FIFO・HTTP/後処理drain等の機能検証と、性能上の採用不成立を分けて扱い、DB/Valkeyのvolumeと全証拠を保持した。その後、利用者が全体設計による実装への移行を承認したため、下記の再設計へ進んだ。採用条件は変更していない。

### SQL計画・実行scope・保存前受付の分離

SQLとplaceholder encoder・結果変換定義は`defineQueryPlan`で保持し、実行時に現在のDB/transaction sessionへ結び付ける。旧sessionや入力値を計画に保持せず、動的default/onUpdateを持つ更新は実行ごとに組み立てる。全利用側を切り替え、旧prepared helperは残していない。

HTTPのmemoは要求内だけで使用し、投稿後処理とqueueの各試行には新しいmemoを作る。後処理の業務入力はoutbox payloadから現在の状態を取得し、analyticsには投稿時点の小さなsnapshotを渡す。保存後に応答前の必須処理が失敗しても、analyticsの試行は失わず、未実行の永続stageはoutboxに残す。

HTTP投稿は保存前に後処理枠を予約する。予約・待機済みtask・実行中の合計は64件、枠待ちのproducerも64件まで。待機中の取消では保存せず、受付不可は`POST_PROCESSING_UNAVAILABLE`（HTTP 503）で返す。終了時は受付済みproducerと後処理を待ち、DB解放を先行させない。

実HTTP/WebSocketのsmokeでは、64件を保持した状態で次の投稿が保存前に待つこと、待機取消が投稿を残さないこと、応答前のタイムライン・アンテナ反映、終了時に受理済み65投稿の後処理が完了しoutbox残留がないことを確認した。同じ形の投稿のSQL計画生成は最初の要求で8回、その後の63要求は新しいtransactionでも0回だった。これは計画再利用と機能の証拠であり、DB/OSのcold条件や高速化を証明する比較ではない。

別の診断ではlocal-onlyのhome投稿を10回直列実行し、毎回後処理を待ってから次へ進めた。初回を除く9要求はSQL組み立て1回（0.069–0.154 ms）、応答まで8 SQL実行、後処理を含め14 SQL実行だった。BEGIN/COMMIT等はこのSQL実行数に含まない。transaction呼び出しからcallback内時間を除いた合計は2.88–4.16 msで、接続取得・制御SQL・スケジューリングを分離した値ではない。比較対象なし・計測用instrumentationありの診断値であり、採用条件の代用にはしない。

追加の実HTTP確認では、64件を予約し64 producerを待機させた状態と受付終了後の両方で503を返し、保存された投稿は0件だった。終了時に64待機producerも拒否され、予約済みproducerの終了後にcloseが完了した。

全体unitは126ファイル・850テスト成功。通常E2E全体は1724成功・1失敗・13 skipで、失敗はクリップ上限テストの準備が200投稿を一斉送信し、新しい受付上限を超えたものだった。検証対象の200件と上限超過拒否は維持し、既存のDB fixtureでノートを準備する形へ移した。fixtureのvisibility指定漏れも修正し、通常E2Eのクリップ99テストは全成功。外部Bun実プロセスでのE2E全体は37ファイル・1725成功・13 skip、終了code 0だった。最終`bun run lint`も成功した。

API metadata変更に伴う`bun run build-misskey-js-with-types`を実行し、生成APIにも`POST_PROCESSING_UNAVAILABLE`を反映した。一時smoke scriptは除去し、結果JSONを保持した。20本の採用比較は未完了であり、前の版の結果を現在の版の合格証拠へ読み替えない。

証拠は`/home/haru/.cache/misskey-optimization.b7uTpY/execution-context-redesign/`の`execution-scope-proof.json`、`request-cost-proof.json`、`admission-http-proof.json`。前の統合版の比較結果・公式upstreamの新規初期化例外は、この局所検証で解消扱いにしない。

### 再設計版の固定連合

現行sourceとsource mapを照合したartifactを`frozen/context`へ固定し、全連合matrixを一度実行した。fork同士は168成功・0失敗・10 pending、公式固定版は108成功・23失敗・47 pending。両cellとも全178件の個別statusが前の固定結果と一致した。途中の待機ツール切断ではcoordinatorを再起動せず、同じ実行から結果を回収した。公式cellの終了code 1は保存した23失敗によるもので、setupは成功し、証拠取得と専用projectの停止も完了した。

両cellの18非queueテーブルの選択属性・参照先の役割属性を多重集合で比較し、差はなかった。outboxと残留queueの状態・activity種類・失敗理由・試行数にも差はなく、state取得エラーは0件。これはランダムなID・emoji名・時刻を正規化した比較であり、全列や完全な参照graphの同一性を証明するものではない。実シナリオの個別assertionと補完的に扱う。SQLエラーの種類・回数にも増加を検出しなかった。

今回は`system.proxy`の主キー競合を観測しなかった。旧観測は、公式NodeInfoとHTMLが同じsystem accountを同期なしに遅延生成する経路に対応していた。forkのmetadata取得コードは承認済み基準artifactとbyte単位で同一だが、それだけで競合頻度の不変や旧HTTP失敗の回復を証明したとは扱わない。新たな例外追加、公式imageの変更、事前warmupによる隠蔽はしていない。

matrixの証拠は`/home/haru/.cache/misskey-optimization.b7uTpY/context-federation/run-20260910T073205Z-c0514dfd/`。選択属性の比較・SQLエラー比較・旧例外の調査は`execution-context-redesign/`のJSONに保存した。

### 再設計版の採用判定とSQL往復

`experiment-context-final`は全20本を完了し、raw成功16本・承認済み一覧cache欠落4本・通常失敗0本・除外0本だった。正しさは`accepted=true`、絶対資源上限は全件成立したが、相対ゲートを満たさず`eligible=false`となった。posting p95のpaired比はcold 1.143 / warm 0.541、posting p50はcold 1.087 / warm 1.064。cold load p95は1.670、database.callsはcold 1.275 / warm 1.277、shutdownはcold 1.475 / warm 1.368だった。warmの投稿応答だけを取り出して採用はしない。

保存済み全runの初回sampleから最終sampleまでをSQL ID別に差分した結果、基準28,315回に対し現行36,139回で、差は7,824回だった。BEGIN/COMMITの増分4,068回、followers取得・note取得・cache世代取得の増分各1,210回が合計7,698回を占めた。これはrun全体の観測であり、個別要求へのSQL時間の因果配分ではない。SQL計画再利用で組み立てを省いても、transaction境界と新しいscopeで必要になった取得の往復は残っていた。

続いて、保存・所有権・HTTP/後処理の境界を緩めず、同じtransaction内の基本保存を一つのstatementへまとめ、後処理の最新入力を一度の取得へまとめた。閾値変更や失敗除外はしていない。

### 基本保存・snapshot取得・後処理並行数の検証

`compound`ではnote・著者の投稿数・outboxを一つのCTE statementで保存する。note挿入への依存を著者更新に持たせ、FK確認と著者行更新のロック順を維持した。poll・返信数・hashtag・instance・channel等は元のtransaction内に残した。後処理のnote・著者・followers・role世代は同じsnapshotで読み、現在のtaskのmemoだけへ渡す。

この状態の全体unitは126ファイル・851成功、通常E2Eと外部Bun E2Eは各37ファイル・1725成功・13 skip、全体lintも成功した。実HTTPでは返信・poll・renote・同時channel投稿・集計・outbox完了を確認した。単純投稿の診断は応答まで6 SQL、後処理込み9 SQLだったが、これは速度の採用証拠ではない。

固定したcompoundのfork連合は168成功・0失敗・10 pending。公式側は固定依存tarballの展開に失敗してテスト未開始となったため、失敗を保存し、同じlockfileのSHA-512に一致するarchiveの取得を確認して公式cellだけ再開した。再開後は108成功・23失敗・47 pendingで、全178件の個別statusは前の固定結果と一致した。forkの再実行はしていない。

選択属性の比較に新しい保存差はなかった。forkの同じlocal follow job 2は、基準側の`already following`からfollowing-pairの一意制約エラーへ診断が変わったが、failed件数・試行数・保存関係1行・関連する集計/flagは同じだった。関係処理の2 moduleと挿入関数も基準artifactとbyte単位で同一。生の診断差は消さず、競合頻度の不変や既存失敗の修正を主張しない。

利用者から検証効率と進捗表示の改善を求められ、以後は変更していない境界の証拠を再利用し、重い検証の前に短い診断を置いた。compoundの短い対照ではSQL 2,829→3,212、負荷応答後outbox 144件、再起動後の配送delayed 16件と約65秒の収束待ちを観測した。この候補へ20-runは追加せず、後処理の直列滞留を対象にした。

後処理を2 workerへ変更し、取り出しはFIFO、予約・待機上限は従来の各64件を維持した。完了順は並行実行に従う。対象3ファイル31テストと型検査が成功。実HTTPでは接続予算1/16の両方で95投稿、chart増分95、実行中最大2件、終了後outbox残留0を確認した。最初の対象テストはDB回復中で本体未実行、最初のHTTP smokeは一時scriptのchart参照先誤りで失敗しており、それぞれの失敗記録も保持した。

`bounded`のコンパイル入力1,652個をcompoundと照合し、差は`NotePostProcessing.ts`だけだった。負荷区間だけの対照2本では7つの正しさ確認が成功、応答後の未完了は両版0、SQLは2,641→2,837（7.4%増）。この診断では停止/再起動・受信側の最終全件確認を実施せず、採用資格は常にfalseとした。元の最終判定条件は変更していない。

### boundedの最終判定と中断回収

`experiment-bounded-final`には全20本の完了記録が残り、raw成功16本・承認済み一覧欠落4本・通常失敗0本・除外0本だった。監督processが終了codeなしで失われた後、実行ownerが残っていないことを確認して孤立したlockを保存し、元のreport CLIでjournalのhashを検証して集計した。再計測は0本。残っていた専用containerも停止し、volumeと証拠を保持した。

判定は`correctness.accepted=true`、絶対資源上限は全件成立、`eligible=false`。paired比はdatabase.callsがcold 1.053 / warm 1.060、shutdownがcold 0.467 / warm 0.837まで基準内となった。一方、warm posting p95 1.168、warm timeline p95 1.113などが未達。queue滞留、I/O等の相対条件も不合格で、改善した指標だけを選んで採用していない。残る原因の切り分けには保存済みの各run・各pairを使い、同じ重い比較を無条件に繰り返さない。

詳細は`candidate-comparison/experiment-bounded-final/report.json`、中断回収は`execution-context-redesign/bounded-interruption-recovery.json`。これらの基点は`/home/haru/.cache/misskey-optimization.b7uTpY/`。

### row mapper・pool対照・同一binary対照

`prepared.ts`では選択列のpathとdecoderをSQL計画の作成時に固定した。実DBから取得した20行を各3,000回変換する交互5組の診断では、参照実装に対する時間比は0.335–0.397、結果の同等性確認は成功した。これは行変換だけのCPU診断であり、投稿・timeline全体の改善や採用を意味しない。nested selection、alias join、custom decoder、NULLの変換を参照実装と照合した。

この状態の対象unitは2ファイル・22成功、全体unitは126ファイル・852成功、外部Bun E2Eは37ファイル・1725成功・13 skip、全体lintも成功した。接続予算1/16の実HTTP確認では本文・公開範囲、返信・poll・renote、同時channel投稿、著者集計、終了後outbox残留なしを確認した。新しい全連合matrixは実行していない。証拠は`execution-context-redesign/mapper-validation.json`、`mapper-cost.json`、`mapper-post-smoke-{1,16}.json`。

固定した`mapper`と基準版のwarm条件3組は6本すべて正しさ確認に成功し、除外0本だった。しかし投稿p50/p99、timeline p50/p95/p99、負荷p50/p95、応答後滞留が絞り込み条件を満たさなかった。単体の行変換が短縮しても全体の採用条件は成立しておらず、この候補の20-runは追加していない。

続いて製品ソースを変更せず、同じ総接続予算を通常query用とtransaction用へ分ける`split` artifactを作った。`mapper`とのコンパイル入力1,652個の差は`db/bun-sql.ts`だけで、接続予算1では共有を維持する。固定基準版とのwarm条件3組は6本すべて正しさ確認に成功し、除外0本だった。paired比は投稿p95 0.939、timeline p95 0.921、負荷p95 0.591だったが、投稿p50 1.051、p99 1.122は条件を満たさず、採用していない。この比較は`mapper`対`split`を直接組にしたものではなく、数値差全体をpool分離の効果とは断定しない。

変更なしの変動を確認するため、両側の設定とapproved build hashを同一に固定したA/A対照もwarm条件3組だけ実行した。6本すべて正しさ確認に成功し、除外0本、最大退行率による判定はすべて成立した。一方、変更なしでも投稿p95のpaired比は0.887、負荷p95は0.566となった。この1回の対照から誤判定率や候補の退行原因は推定せず、短い比較の改善値だけではコードの効果を立証できない証拠として残す。A/Aでは最低改善率を要求していないが、実際の採用基準は変更していない。

上記の短い対照はいずれもcold条件、停止/再起動、サンプリング間の資源peakを保証せず、採用資格は常にfalse。reportは`candidate-comparison/diagnostics/{mapper,split,aa}-warm-report.json`、実行前の固定条件は同ディレクトリの各protocolに保存した。pool対照の入力差は`candidate-comparison/mapper-pool-proof.json`と`split-artifact-proof.json`に残した。worker起動は既に独立scopeのmicrotaskへ遅延しており、計測根拠なしに起動schedulerを変更していない。D3は未完了のままとする。

### 測定手順の再設計（methodRevision 2、採用条件改訂前の記録）

利用者は採用閾値を維持した測定手順の改訂を選択した。以下は新しいA/A実行前の固定手順であり、識別性の成立や候補の高速化はまだ主張しない。以前のA/Aを見て設計した手順なので、その既存データを確認用標本として再利用しない。旧harness 6ファイルと採用・正しさ条件は`candidate-comparison/protocol-v2/original-harness/`と`intent.json`へ保存した。製品の実行artifactはapprovedとmapperで固定し、変更は計測側とその型宣言に限定する。

`preregistration.json`は6組へ変更し、before/afterの先行回数とcold/warmの先行回数をそれぞれ同数にした。投稿40、timeline80、負荷80・並行数4は維持する。単純な標本数増加では投稿集合、timeline本文量、履歴走査、後処理の滞留条件も変わるため、今回は実行順・準備・記録・観測の境界を変更対象にした。

両条件とも既存20投稿に直列20投稿・並行20投稿を加え、全件を後続の本文・公開範囲・集計・ページ境界・復旧確認へ残す。共通の60投稿をdrainした後、warmは同じprocessで内容と順序を検査する20回のtimeline取得を行う。coldはDB/Valkeyを戻さずapplicationを停止・再起動してPID・artifactを検証し、scenario warmupなしで測る。readinessが触れる経路、OS/DB/Valkeyのcold化は保証しない。測定中のtimelineは100投稿、負荷後は180投稿となり、削除したbarrierの受付数も集計に残す。

各要求の開始前に記録I/Oを待つ処理を除去した。計測・負荷区間のjournal deltaは32 MiBを上限にbufferし、区間外・失敗時・終了時にflushする。各応答は受信中に256 KiB上限を検査し、超過時はcancelして失敗にする。本文受信とJSON parseは引き続きHTTP時間へ含める。timerとdrainは一つのobserver実行へ合流し、開始・終了・要求元・遅延の記録を残す。遅れたpollを直後に連続実行しない。これらは計器の処理経路を変えた事実であり、旧A/A差の原因を特定したという意味ではない。

新しい`control.mts`は、両側が同一のdeployment設定であることを要求し、通常比較と同じ`runOne`・journal再読込・正しさ・絶対資源上限を使う。まずwarmの6組12本を登録し、成立した場合だけcoldの独立した6組へ進む。候補比較は両条件の成立後とし、A/A自体の`eligible`は常にfalse。`init CONFIG DIR warm|cold`で設定・harness・手順・順序を固定し、`run CONFIG DIR`で実行、`report CONFIG DIR`で保存済みjournalから再集計する。

A/Aの追加条件は、投稿・timeline・federationResponse・負荷それぞれのp50/p95/p99について、6個のpaired log比の最小・最大からなる区間全体が`±0.5 × min(-log(0.95), log(1.05))`に入ることとした。比の範囲は約0.9759–1.0247で、候補の5%改善・5%退行・10%資源条件を置き換えない。この区間の周辺被覆は、独立で連続なpaired差という仮定の下で96.875%。複数指標の同時被覆や5%効果の検出力を保証せず、p99が少数標本の最大値である制約も残る。

途中の1組が範囲外なら、残りがどの値でもこの固定区間は成立しない。その場合、または正しさ・記録・絶対上限が失敗した場合は直ちに棄却し、未実行の予定runも分母へ残す。未完了時に被覆区間を提示したり、通るまで追加実行したりしない。旧結果と新結果は別の実験として保存する。

### 利用者承認による性能劣化の許容（adoptionRevision 2）

利用者は多少の性能劣化を許容し、提示した10%・20%の選択肢から10%以内を選んだ。ここからの採用判断では、構造整理・保守性の改善と引き換えに、遅延・完了時間の悪化を10%以内まで許容する。投稿p95の5%以上改善という必須条件と、そのための特別な判定分岐は撤廃する。

判定対象は従来のp50/p95/p99と非同期完了・終了時間で、cold/warmごとのpaired比の中央値を用いる。CPU・I/O等の相対資源条件は10%以内のまま。基準値0のpair、欠損・失敗したrun、正しさ・認可・公開範囲・データ整合性の条件、承認済みupstream例外の範囲、絶対資源上限は緩めない。

A/Aは測定のばらつきを診断するものであり、上記で追加した一致条件そのものを製品採用の必須条件にはしない。今後A/Aを登録する場合の診断幅は、改善必須条件に依存せず、遅延許容率から`±0.5 × log(1.1)`として求める。A/Aの成功・失敗だけで候補の高速化や10%以内の性能維持を断定せず、比較値と不確実性を併記する。

過去のreport・journal・棄却結果は変更しない。変更前のpolicyと実行用harness 7ファイルは`candidate-comparison/policy-before-latency-10-9oaAYe/`にhash付きで保存した。今回の許容条件変更だけで既存候補を採用扱いにせず、新基準での判断は旧結果と区別して記録する。測定手順の`methodRevision`は2のまま、採用条件は`adoptionRevision: 2`として区別する。

### 10%許容基準での24-run

`experiment-allow10-mapper`は固定したapprovedとmapperをcold/warm各6組、合計24本で比較した。実行結果は正常18本・承認済み一覧欠落5本・例外外の失敗1本、除外0本。再実行や途中の候補・条件変更はない。正式reportは`correctness.accepted=false`、`eligible=false`であり、正しさを通過しなかったrunのため性能・資源の比較配列を出力していない。空の比較配列を全条件成功とは扱わない。

例外外の`3-cold-after`では、再起動後の期待174件が受信DBに存在し、同じviewerによる直接取得も174件成功したが、一覧は159件だった。永続cacheは100件、TTLは-1。欠落15件のうち1件は観測cache範囲の内側、14件はその最新IDより新しいため、現在承認されている「範囲内の欠落」の条件に入らない。他の8つの正しさ確認は成功したが、この欠落を既知例外へ自動分類していない。

性能の切り分け用に、失敗runも含む全24本のhash検証済みjournalからHTTP・完了時間だけを補助集計した。coldの全対象は10%以内。warmでは投稿p95のpaired比1.296だけが10%を超え、投稿p50/p99、timeline、負荷応答、連合・drain・終了時間は範囲内だった。これは正式な採用判定でも全資源評価でもない。正しさが受理されたwarm全12本に限った別の補助集計では、記録済み資源指標の相対条件も成立したが、coldの失敗runを除いて全体成功とはしていない。

補助診断は`http-completion-diagnostic.json`と`warm-complete-cohort-diagnostic.json`。いずれも`diagnosticOnly=true`、`eligible=false`を明記し、元の`report.json`・journal・失敗状態を保持した。warm投稿p95の各pairは0.890、6.443、1.504、0.369、1.301、1.296であり、これらのばらつきから原因や改善効果を断定しない。

比較前には失われた`/tmp`の支援環境を復旧した。元の制御ファイル7件とsnapshot4件のhash、既存containerのID/image、対象10サービスのCompose設定hash、候補に含まれる現在の606ソースファイルの一致を確認した。固定revisionと保存差分から支援ソースを戻し、workspace支援ビルドの照合可能な5 moduleも保存済み入力とバイト一致した。TLS等の未追跡支援ファイルには保存版を用いて新しいhashを記録しており、失われたコピーとのバイト一致は主張しない。

既存のSQL統計はreset時刻・dealloc値が保存記録と一致し、負荷時に累積時間が増えたquery ID `1884129759089703605`を`user.updatedAt`・`user.notesCount`の更新と照合できた。この対応付けは要求単位の待ち原因の証明ではない。環境・対応付けの証拠は`protocol-v2/restoration-ready-proof.json`と`retained-statement-lookup.json`。比較後、専用サービスは停止した。

### 一覧欠落の責任境界

固定upstream containerの差分にbackendアプリケーションの変更はなく、runtime設定・証明書・files領域だけが含まれていた。固定imageの実際の`FanoutTimelineEndpointService.getMiNotes`を、記録済みの認可済み174投稿とcache100 IDを入力にしてオフライン実行した。記録cacheを使うと159件、cacheなしでは174件を取得し、欠落15件のID集合も元の失敗と一致した。DB・Redis部分は記録データを返すアダプタであり、新しい実通信・再起動試験ではない。再生環境のimport先・読取権限の修正前に失敗した3試行も残し、成功結果は`upstream-reader-replay-attempt-4.json`へ保存した。

[固定版の一覧取得処理](https://github.com/misskey-dev/misskey/blob/bd9eb7c77942ef11749a04e7a5f24bee935d764b/packages/backend/src/core/FanoutTimelineEndpointService.ts)は、cacheで件数が足りればそのまま返し、不足時も読んだ末尾より古いDB範囲を補う。このため、cacheから抜けた新しい投稿を取り直せない。[投稿後処理](https://github.com/misskey-dev/misskey/blob/bd9eb7c77942ef11749a04e7a5f24bee935d764b/packages/backend/src/core/NoteCreateService.ts)にはDB保存後に遅延実行され、Redis完了を待たない経路があり、[終了処理](https://github.com/misskey-dev/misskey/blob/bd9eb7c77942ef11749a04e7a5f24bee935d764b/packages/backend/src/boot/shutdown-handler.ts)もそのdrainを待たない。

今回の一覧不整合はupstream受信側のDB/cache整合性の不具合と判断する。検証側のviewer・author・filter・cursorの扱いに、今回の欠落を説明する不備は見つからなかった。ただしcache更新を失った具体的な時点や、こちらの変更による発生頻度の増加は未確認。例外範囲は自動的に変更せず、こちらのwarm投稿p95未達も別に扱う。

### warm投稿のtransaction完了待ちとWAL同期

製品ソースを変えず、SQL実行とtransaction callbackの開始・終了を記録する診断artifactを作った。warm 1本の正しさ確認は成功した。直列投稿40件とscopeの対応は、同じ保存processで準備60件の後に測定投稿が続くという順序による。要求IDを伝播した対応ではない。ある投稿ではHTTP 104.421ms、保存SQL 1.945msに対し、callback終了からtransaction完了まで95.497msを要した。

Bun 1.4.0の`process.hrtime.bigint()`は、同じtime namespaceでも別processと原点が一致しなかった。このためprocess間の時刻照合は採用せず、同一process内の所要時間だけを使った。初回集計の時刻照合失敗も保存している。アプリ停止中の読取専用transaction 20回では、callback終了後の待ちは最大0.228msだった。準備時の設定・loader失敗も記録し、この対照だけで負荷中のclient処理やWALを原因と断定していない。

続いて通常のmapperでwarm 1本を実行し、PostgreSQLの全既存processと新しい子processの書込・同期syscallを観測した。正しさ確認は成功。WALの`fdatasync`は598回、最長306.240msだった。投稿40件のp95は78.517msで、遅い3件とWAL同期待ちの重なりは次のとおりだった。同期区間の合計では重複を除いている。

| 投稿のHTTP応答 | その区間と重なったWAL同期 |
| -------------: | ------------------------: |
|      104.278ms |                  89.550ms |
|       92.047ms |                  72.114ms |
|       78.517ms |                  61.398ms |

この照合にはHTTPのISO時刻と`strace -ttt`の実時刻を使った。HTTP開始時刻の精度・記録位置、ptraceによる観測の影響が残る。どの要求が各DB接続を使ったかは追跡しておらず、重なった時間をその要求の待ち時間と同一視しない。syscallの時間にはスケジューリングも含まれる。以上は保存済み比較のwarm p95比1.296の原因証明でも、10%条件を満たす採用証拠でもない。

固定approvedのsource mapと一致するソースでは、投稿保存に加え、必須・遅延のoutbox完了をそれぞれautocommitのDELETEで永続化していた。現行版は完了削除と副作用を同じtransactionで保護する。したがってBEGIN/COMMITのSQL件数増加だけから、WAL同期の増加は導けない。所有権確認やrollbackを省く変更、`fsync`・`synchronous_commit`の緩和は行っていない。

証拠は`candidate-comparison/diagnostic-warm-boundaries/`、`diagnostic-wal-observation/`、`posting-durability-source-proof.json`に保存した。syscall logはRAM上に64 MiB上限で記録し、1,290,017 byteを回収した。未完のsyscall・解析不能行・容量到達は0件。journalのhashとlog全体が実行区間を含むことを確認し、コピーのhash一致後に一時logを削除した。専用containerは全て停止済み。製品変更と新しい24-run比較は追加せず、D3の未達判定を維持する。

### 最新cache IDより新しい欠落の追加承認（adoptionRevision 3）

利用者は、固定upstreamの同じ一覧不整合として新しい側の欠落も例外に含めることを承認した。判定からcache最新IDによる上限だけを外した。最古IDより新しいこと、cache自体に欠落IDがないこと、固定peer・観測期限・永続cache・保存全件一致・同じviewerの直接取得という条件は維持する。性能・資源の10%条件は変えず、`methodRevision`は2のままとした。

新しい負荷実行はせず、全24本のjournalをhash検証して再評価した。元の正常18本・既知失敗5本・通常失敗1本という記録は変更していない。`3-cold-after`では、保存済みの例外文字列全体が一覧欠落1件だけを含むAggregateErrorとして再構成できることも確認した。このrunだけを再評価用のメモリ上で既知失敗と扱い、元のerror・state・journal・reportを保存した。結果は正しさ受理、既知一覧失敗6本、除外0本となった。

全応答・完了・資源指標を集計した結果、採用は引き続き不成立だった。warm投稿p95比は1.296。coldではqueue peak backlogの0→21件、oldest pendingの0→47.814msというpairがあり、基準値0からの増加を拒否する相対条件に該当した。絶対資源上限は全件成立したが、相対条件の代わりにはしていない。旧reportの空だった比較配列を成功と見なさず、今回初めて全24本を含めた比較結果を別に出した。

変更前のharnessは`candidate-comparison/policy-before-cache-tail/`、再評価は`reassessment-cache-tail/report.json`に保存した。元のharness hashと変更箇所、元のexperiment・reportの不変も確認した。これは承認後の遡及評価であり、新しい事前登録実験ではない。

### 独立レビューと対称trace診断の起動失敗

利用者の依頼で別エージェントへ資料を引き継ぎ、D3判定・harness・遡及評価を独立にレビューした。この範囲で判定を覆す重大な不具合は指摘されなかったが、製品全体の再監査ではない。warmの未達には投稿中にobserverが動いていないrunもあり、計測器との同時実行だけでは説明できない。coldのsampled peak 0はqueue活動なしを意味せず、21件のsampleもoutbox 20件と配送中1件であるため、BullMQ履歴だけでは最大滞留を復元できないという指摘を受けた。

次の診断をwarmの2組4本に限定し、before→after、after→beforeの順で固定した。両版に同じ独立診断ALSを加え、HTTP要求ID、保存、応答前の必須outbox、遅延処理、SQL・transactionの所要時間を記録する。基準版のautocommitを「COMMIT時間0」と扱わず、共通処理全体の時間を比較する。これは変更箇所を探す診断であり、採用条件や元24本の数値は変更しない。

固定approvedの1,673入力、mapperの1,652入力から、それぞれ診断hookの3箇所と共通module追加だけが変わることをbuildで確認した。基準版の復元支援treeにあった2箇所の差は、固定artifactの入力へ隔離loader内で戻した。製品ソースと通常builtは変更していない。診断module単体では、要求ID、HTTP後の遅延処理、製品側ALSを再束縛しないこと、返値・例外の維持、payloadを保存しないことを実行確認した。

ただし最初の`1-warm-before`は`start`で失敗した。Mainがbackend停止中にproxyを先に起動し、nginxが`misskey.a.test`・`misskey.b.test`を解決できず終了したことが原因だった。driverでは`getaddrinfo ETIMEOUT a.test`となった。記録済みworkload要求・sample・正しさ確認はいずれも0件。identity取得前なので、終了時のtraceも所有processを検証できず未帰属として保存した。

この診断は失敗1本・未実行3本のまま保存し、4本を分母から除いていない。解析結果は`attributionAvailable=false`で、性能や処理差について新しい結論は出せない。負荷診断の自動再試行はしていない。

起動順序は依存サービス、両backendのhealthy確認、nginxの順へ修正した。通常mapperへ戻したうえでdriverから両peerのHTTPS `/api/meta`が200を返すことを確認し、専用サービスを全て停止した。この確認は疎通だけで、投稿負荷や性能比較ではない。

固定条件は`candidate-comparison/paired-trace-protocol.json`、build・artifact proofは同じディレクトリの`paired-trace-build-*-proof.json`と`trace-*-paired-artifact-proof.json`。失敗を含む記録は`diagnostic-paired-boundaries/`、原因と修正後の疎通は`paired-infrastructure-failure.json`と`paired-infrastructure-recovery.json`に保存した。

### 性能判定から切り離した出荷（2026-09-23）

利用者は、正しさを検証済みのB/C/Eと不具合修正を先に出荷し、その後に性能の原因調査を続けることを選んだ。これは採用条件の変更ではなく、adoptionRevision 3の判定（warm投稿p95比1.296、cold queue滞留の基準0からの増加で不採用）は不成立のまま残す。出荷版は保存済み24-runの`mapper`候補と同じ性能特性を持つ前提で扱い、warm投稿p95の悪化を既知の未解決リスクとする。A/A対照で変更なしでも投稿p95比0.887・負荷p95比0.566が出ており、1.296が測定ノイズか実際の退行かは未確定。

出荷前に同じ作業ツリーで全体lint、backend unit、通常E2E、外部Bun E2E、frontend・SDKのテストを実行した。Bun 1.4.0でunit 127ファイル・861成功、通常E2Eと外部Bun E2Eは各37ファイル・1725成功・13 skip、frontend 584・misskey-js 36・sw 10成功。計測harnessの環境テストはfixtureが`recoverySnapshot`必須化に追従しておらず失敗していたため、fixtureを直した。

出荷ソース（`c11c114371`時点のbackend）の連合matrixは、fork同士が168成功・0失敗・10 pendingで前回と一致した。公式固定版セルは利用者判断で途中停止し、出荷ソースでのupstream互換は未確認のまま残す（最後の完走はcompound版）。前回の公式セルは約98分のうち既知失敗23件の待ちが4,042秒を占めており、既知失敗をtimeoutまで待たずに落とす改善が必要。初回の起動はcompose.matrix.ymlの自動割当ネットワークが`172.20.0.0/16`を先取りして失敗したため、全ネットワークにサブネットを明示した。D2/D3のチェックボックスは更新しない。

### 連合matrixの既知失敗の待ち時間短縮（2026-09-24）

公式セルの約98分のうち、既知失敗23件の待ちが4,042秒を占めていた。原因は二つ。公式版のinbox処理失敗（重複Acceptの`No follow request.`等）がbackoff付き再試行でdelayedに残り、`deliveryBarrier`が最大360秒待ったため、原因のテストだけでなく同じファイル・後続ファイルのテストとbeforeAllも180秒timeoutで連鎖失敗・skipしていた。もう一つは、公式版のdeliver backoff（60秒・180秒）を障害回復テストがそのまま待っていたこと。

barrierは失敗理由付きでdelayedになったinboxジョブを即座に失敗として報告し、報告済みと、テストファイル読込前に作られたジョブは以後待たない。fork同士のセルではinboxジョブが一度もdelayedに入らない（異常系はUnrecoverableErrorで即failed）ことを実行ログで確認した上での条件。障害回復テストは再試行待ちの間、送信側のdelayed deliverを`admin/queue/promote-jobs`で繰り上げる。再試行されるのは同じジョブで、再送経路と冪等性の検査は残る。

結果（`556022711e`＋本変更、Bun 1.4.0）: 公式セルは約98分→4分35秒、161成功・7失敗・10 pending（前回108・23・47）。残る7件はMove 2件、ブロック解除後のFollow/Reaction 2件、応答喪失時の重複Accept 1件、凍結解除後の復旧2件で、すべて上表の既知失敗。新規失敗は0件。失敗→成功16件と、skip→成功37件は連鎖の巻き添えだったもので、公式互換の保証範囲がその分広がった。fork同士のセルは約50分→2分15秒、168成功・0失敗・10 pendingで、直前のfork実行と全178件の個別statusが一致した。以後の公式セルの比較基準はこの7失敗とする。

2026-09-25、この7件を公式版と組むときだけ`knownUpstreamFailure`（`test-federation/test/utils.ts`）で包み、記録どおりの形で失敗することを確かめる検査へ変えた。手順と条件は削らず毎回実行し、失敗の照合は各テストのエラー内容で行う（ブロック解除後は公式版APIの拒否文言、凍結解除後は公式版の内部エラーのうち`EntityNotFoundError`で`MiUserProfile`が見つからないもの、Moveは引き継ぎ条件の不成立、重複Acceptは公式版inboxの`No follow request.`再試行）。別の形で失敗すれば従来どおり落ち、成功すれば「既知失敗が再現しない」で落ちるので、公式版側の修正も検知できる。凍結解除後の内部エラーは両テストとも公式版（TypeORMの`EntityNotFoundError`、公式版形式のID）から返っていることを診断ログで確認した。以後の比較基準は公式セル・forkセルとも168成功・0失敗・10 pending（公式セル262秒、forkセル117秒）。

### 出荷後の原因調査：局所投稿のABBA比較（2026-09-24）

重い24-run環境（専用containerは削除済みで復元が必要）の代わりに、単一host上の専用PostgreSQL 18（`fsync`・`synchronous_commit`は既定のon）とValkeyで、A=`1dba6556aa`とB=出荷版（backend/srcはmapperと型宣言1ファイル以外同一）を同じ設定・同じseed（投稿者20・読者20・follow 400）から毎回作り直して比較した。1 runは暖機30投稿、アイドル10秒、直列200投稿、並行4で400投稿、各段のqueue_outbox完了待ち。順序はABBA×3の12 run・6組、Bun 1.4.0、クラスタ構成はhttp 1 / queue 1。仮説・記録キー・判定は計測前に`~/dev/misskey-rootcause/PROTOCOL.md`へ固定し、組数の数え違いだけデータ取得前に訂正した。

正しさは12 run全てで成功（各630投稿が200・本文一致、保存630、outbox残0、読者timeline先頭20件がDBの新しい順と一致）、除外0 run。判定は直列p95のB/A比が1.10超の組が6組中3組で「不確定」、並行p95は1組で「この条件では再現しない」。組ごとの直列p95比は1.59・0.57・1.56・3.20・0.47・0.60、並行p95比は0.87・0.46・0.95・1.45・0.96・0.33。p50比は0.79–1.19に収まった。

WAL同期回数を増やしたという仮説は棄却した。1投稿あたりのWAL fsync回数は直列でA 1.58–2.81・B 1.57–2.82と同じ範囲で、transaction commit数は並行でA 5.4–10.6に対しB 2.4–4.3と少ない。一方、同じ版の中でも直列p95はA 13.9–109.2ms、B 15.4–51.5msと大きく動き、各runのp95は1投稿あたりのWAL fsync所要時間に追従した（例: 5-Aは25.3ms/投稿でp95 109ms、6-Bは1.6ms/投稿で並行p95 17ms）。fsync回数が同じでも所要時間がrunごとに最大約20倍変わるため、このhostでのp95はコードよりディスク同期の遅延に支配される。

SQL文数は1投稿あたりA 20.1→B 22.0（+9.5%）。CPUは直列でほぼ同等、並行ではBが1投稿あたり約0.5ms少なかった。アイドル時の背景負荷はA 6文/秒・約30 commit/秒に対し、Bは2文/秒・4–17 commit/秒。

記録しなかった次元: 連合配送（リモートfollowerなし）、cold再起動、queue滞留peak、timeline読み取り遅延。保存済み24-runのwarm投稿p95比1.296は連合peakありの条件であり、本比較はその原因をWAL同期回数の増加とは説明できないことだけを示す。生データは`~/dev/misskey-rootcause/results-1/`。

### 速度劣化の再分析（2026-09-24）

保存済み24-runを全件で再集計した。1 runの投稿は40件なのでp95は2番目に遅い1件で、warm投稿p95の組別比は0.37–6.44に散り、同じ標本のp99比は0.789・p50比は0.944と逆向きだった。版ごとに6 run分をまとめたwarm投稿p95の比は1.24、run単位bootstrapの95%区間は[0.88, 1.96]で1を含む。他の応答指標（cold投稿、timeline、負荷のp50/p95/p99）も全て区間が1を含み、負荷p95は0.76–0.88と基準版より短い側だった。coldのqueue滞留2指標の不合格は、基準側が0の1組で比を計算できないことによる。残り5組の最古待ち時間比は0.12–0.58で、候補版のほうが短い。

局所ABBA（results-1）の直列p95は、run毎の1投稿あたりWAL fsync所要時間で相関0.96まで説明でき、fsyncを差し引いた残差の版間差は約4 ms（run間ばらつき±7 ms）だった。1投稿あたりのWAL bytes・records・fsync回数の範囲は両版で重なる。

ディスク揺れを除くため、DBをtmpfsに置いて同じ手順を事前登録の上で再実行した（results-2、12 run全て正しさ成功・除外0）。判定は直列・並行とも「この条件では再現しない」。全件プールのB/A比と95%区間は、直列p50 0.99 [0.92, 1.06]、p95 0.96 [0.84, 1.12]、並行p50 1.02 [0.94, 1.10]、p95 1.02 [0.86, 1.26]。1投稿あたりCPUは直列5.14→5.11 ms、並行3.22→2.97 ms。6-Bの並行段だけcommit/fsync数が異常に小さく、統計の反映遅れの可能性があるが、遅延値には影響しない。

結論として、局所投稿の経路ではコード由来の遅延劣化を検出できず、p50で±約10%、直列p95で+12%を超える劣化は区間から外れる。24-runの1.296は、少数標本のp95とディスク同期の揺れで説明できる範囲にある。未検証は連合配送（リモートfollowerへのdeliver）を含む投稿、cold再起動直後、queue滞留peak。tmpfsは診断条件であり、本番の耐久性設定は変えていない。生データは`~/dev/misskey-rootcause/results-2/`。

### 連合配送ありの比較（2026-09-24）

24-runの条件に近づけるため、tmpfsのDBに2つのリモートホスト（各10ユーザー、共有inbox 2件）が投稿者20人全員をフォローする状態を作り、受け皿のサーバーで受信を記録した。A=`1dba6556aa`、B=`556022711e`（出荷版）、Bun 1.4.0、ABBA×3。手順と判定は計測前に固定した。12 run全て正しさ成功（各630投稿が両inboxへ署名付きで到達、欠落・重複0）、除外0。

投稿p95のB/A比が1.10を超えた組は直列・並行とも0/6で「この条件では再現しない」。全件プール比は直列p95 0.722 [0.409, 1.683]、並行p95 0.580 [0.326, 1.957]、p50は1.002と0.938。1投稿あたりCPUの組比中央値は直列0.973、並行0.933。局所・tmpfs・連合配送ありのいずれでも1.296は再現せず、24-runのwarm投稿p95は少数標本とディスク揺れによるばらつきと判断する。D2/D3の採用判定は、この計画の条件（24-runの相対ゲート）のまま不成立として残し、再計測はしない。

配送遅延（投稿応答から受け皿の最初の受信まで）は、直列p95 920→1035 ms（比1.125 [0.801, 1.510]、組判定は不確定）。分布は両版とも約55%が50 ms未満、約20%が0.5〜1.5 sで、版差ではない。原因はdeliver workerの起動レート上限（`queues.deliver.maximumStartsPerSecond`、既定128件/秒）で、計測負荷が直列で約200件/秒・並行でそれ以上の配送を生むため上限に達し、遅れた配送は1秒枠の明けに同時に届く（遅延が投稿順に線形に縮む）。federationステージは応答後の`NotePostProcessing`でinline実行されて`deliverQueue.addBulk`へ直接入り、1秒周期のoutbox配信は通らない。同じB版で上限だけを100000にした2 runでは、0.3 s以上の配送が直列194–197→0件・並行688→0件、配送遅延p95は直列968→9–11 ms・並行4.3–4.5 s→31–53 msになり、欠落・重複・署名欠落は0のまま。上限はリモートへの送出を抑える運用設定で、既定値は変えていない。生データは`results-fed-limit/`。生データは`~/dev/misskey-rootcause/results-fed/`、手順は同ディレクトリの`PROTOCOL.md`。

### ノート検索の短い語の走査上限（2026-09-24）

trigram index（`IDX_NOTE_TEXT_TRGM`）は既存で、3文字以上続く英数字を含む語はこれを使う。100万件の合成データ（`~/dev/misskey-rootcause` の `trgm_bench`、日本語語彙と英数字語を混在）で、そうした語はAPI応答5〜22 ms、古い投稿にだけ出る語も7 msだった。trigramを作れない語（2文字以下など）は主キーの全件走査になり、一致なしの「ゑゑ」で1.45 sかかった。LIKEのままでは、プランナーがtrigram indexの全件読み（実際は100万行）を約100行と見積もって選ぶため、走査範囲を条件で絞っても効かない。そこでtrigramを作れない語だけ `strpos` で判定し、ページ起点から並び順に10万件を読む副問い合わせを走査元にした。境界idを先に数える形は、一致の多い短い語でも毎回10万件を読み、「猫」6.8→37.5 ms・「kw」5.0→40.6 msと悪化したため採らなかった。利用者・チャンネル指定の検索は窓を掛けない。あわせて `notes/search` に30回/分のレート制限を付けた。

計測は既存SQLのまま（前）と変更後を交互に起動し直して4回ずつ比べた（`search-abba/`）。「ゑゑ」1468→111 ms（0.08倍）、一致なしの3文字語やtrigram経路の語は変わらない。HEADのLua版レート制限の上乗せは、制限あり・なしの交互3回ずつで語ごとの中央値比0.92〜1.16（`search-head/`）。B tree（e41419a474より前、判定が複数往復）の同比較は1.09〜1.61で、制限判定1回化の効果が確認できる。e2eに短い語の大文字小文字・`%`の字義一致・前後ページングの検査を足し、比較の大小無視と未エスケープLIKEへの変異がそれぞれ落ちることを確かめた。窓の起点をカーソルから外す変異は、10万件未満のテストDBでは検出できない。

未対応: 約1万件に一致する中頻度の語（`kw123`）は、プランナーが一致件数を約100と見積もってbitmap走査後に全件へ可視性判定を掛け、変更前後とも約220 msかかる。SQLは変えていないので本件の範囲外とした。

### 配送の宛先ホスト間の公平化（2026-09-24）

配送の起動上限（既定128件/秒）はキュー全体で共有され、1ホスト宛ての大量投入の後ろで他ホスト宛てが待つ。ホストごとに上限を設ける案は、フォロワーが大手インスタンスに偏る通常の運用で主な宛先を常に遅くするため採らず、投入時にBullMQの優先度を付ける形にした。優先度は `1 + floor(log2(ホストへの投入数))` で、投入が10分途切れるまで数え直さない（`core/queue/deliver-priority.ts`）。最初の実装は投入量を10秒で指数減衰させていたが、減衰すると同じホストの後のジョブが先の滞留より高い優先度になり、Create→Deleteの順が逆転し得るため単調に改めた。優先度なしのジョブは優先度付きより常に先に処理されるので、キューをサブクラスにして全投入経路（投稿系・管理者凍結・outbox発行）に効かせている。未処理ジョブはwaitではなくprioritizedに入るため、管理画面の待機件数・ジョブ一覧、queue-statsデーモン、テストの読み取りをprioritized込みに直した。リレー配送は投入を待たずに戻り、失敗が未処理のrejectionになっていたので待つようにした（呼び出し側は全て`void ... .catch`か`await`）。

先頭詰まりの計測（`~/dev/misskey-rootcause` の `measure-hol.mjs`、`rc_seed_split`）は、remote-aだけがフォローする投稿者10人が800件を並行投稿し、その最中にremote-bだけがフォローする投稿者が10件投稿する。受け皿は127.0.0.1と127.0.0.2で別ホストとして受ける（同一ホストのままだと両者が同じ優先度になり差が出ない。最初の比較はこれで無効にした）。単調版の前後6組（`results-hol3/`）で、remote-b宛ての到着遅延はp50 1206→527 ms [0.34, 0.62]、p95 2163→1076 ms [0.42, 0.56]。remote-a宛ての滞留の解消時間は中央値5583→5612 msで総処理量は変わらない。完了ジョブの時刻からの分解では、remote-b宛てのキュー待ちp95が1787→765 msに減り、残りは起動上限の1秒枠の待ちと、投稿後処理（作成→投入 p95 約0.4 s）である。

全配送が1ホスト宛ての通常の連合計測（`results-fed-fair2/`、前後6組）では、投稿応答p50が直列1.01倍 [0.91, 1.13]・並行1.08倍 [0.97, 1.19]、p95は直列0.91倍・並行1.06倍、投稿あたりCPUは並行で5.77→6.19 ms（+4.7%）、配送遅延と完了時間は変わらず、欠落・重複・署名欠落は0。優先度付き投入はEVALSHAで1往復を足す。最初の3組では1組だけ直列p50が6.6→12.2 msの外れ値を出したが、6組では再現しなかった。
連合matrixはforkセル168成功/0失敗/10 pending、upstreamセル161/7/10（既知の7件のみ、300秒）で基準と一致した。途中、テストの配送ジョブ検索に `prioritized` を公式版へも渡してInvalid paramになり、upstreamセルが14失敗・1,136秒になったため、fork宛てだけに付けるよう直した。

### 投稿後処理の同時実行数（2026-09-24）

大量投稿（`measure-hol.mjs`、800件を16並行）中、`NotePostProcessing`の待ち行列は受付上限64のうち57〜60件で張り付き、作成から配送投入までp50 245 ms・p95 409 msだった。1件の後処理は平均約9 msで、内訳はBEGIN+outbox行DELETE 2.4 ms・文脈の読み込み1.8 ms・ステージ2.1 ms（federation 2.5 ms・webhooks 1.4 msが大半）・COMMIT 2.8 msとほぼDB往復の待ちであり、2並行では約180件/秒で頭打ちになる。文脈はHTTPのモデルを保持しない設計のため読み直しを残し、同時実行数だけをDB接続プールの1/4（2〜8、既定の30接続で7）へ上げた。実行中は接続を1本持つので、固定値にすると接続を絞った構成でHTTP要求の分を奪う。

前後3組（`results-pp2/`）で作成→投入はp50 179→146 ms・p95 283→191 ms。配送の到着遅延は変わらない（起動上限128件/秒が先に効く）。4・8並行の予備比較でも同じ傾向で、投稿時間（800件で約3.9 s）は並行数によらなかった。通常の連合計測6組（`results-fed-pp/`）では投稿応答p50が直列0.99倍・並行0.97倍、p95は1.06・1.02倍でいずれも区間が1をまたぎ、投稿あたりCPUは並行で5.94→5.62 ms、欠落・重複・署名欠落は0。

この作業中に、ef2660720dのunit分離の変更がuserListストリームの5秒タイマーの漏れを表に出し、全テスト成功のまま未処理rejectionで`bun run test`とCIのbackendテストが失敗していたことを見つけ、183bc42f95で直した。件数の行だけで判定していたのが見落としの原因で、以後は終了コードと未処理エラー件数も確認する。

### ノート検索の中頻度語（2026-09-25）

100万件の合成データ（`trgm_bench`、`setseed(0.42)`で再現可能）で一致件数11件〜82万件の25語を測ると、1,900〜14,000件に一致する語だけが25〜145 ms かかった。`LIKE '%語%'`の件数見積もりが統計の標本次第で外れ、kw100（実13,655件）を約25件と見積もってtrigram indexで一致全件を集め、全件に結合・可視性判定をかけてから並べ替えていた。同程度の件数でも見積もりが1,052件になったkw99は主キーの逆順走査で10件そろった時点で止まり15 ms だった。idだけを先に取る2段階化は、一致行のヒープ読みそのものが55〜137 msかかり効果が小さいため採らなかった。

採用した形は、まず新しい順に「1ページの件数×500件」（上限10万件）だけ読んで探し、1ページ分そろえば返す（最新の一致をそのまま集めるので結果は同じ）。そろわない語は一致率約0.2%未満なので、従来どおりindexで全体を探す。窓の空振り費用（約10 ms）はindexで一致400件前後を拾う費用と釣り合う。利用者・チャンネル指定の検索には掛けない。前後の交互計測（変更前2回・変更後3回、各語15回の中央値、`search-dense3/`）で、中頻度語は25〜145 ms→6〜15 ms（kw100 145→6.5、kw123 124→6.5、kw500 59→12）、一致1,000件以下の語は10〜24 ms→19〜39 ms、2.7万件以上の語は変わらず約6 ms。最初の変更前1回はレート制限（30回/分）に掛かり429の速い偽値が混じったため除外した。e2e（`test/e2e/note-search.ts`）は窓の中・窓の外・窓の中の一致がミュートで全て除かれる場合を通し、全体検索への切り替えを消す変異で2件落ちることを確かめた。

## 根拠となる入口

リンクはこの文書からの相対パス。実装で移動した場合は本書も更新する。

- [workspace と標準コマンド](../package.json)
- [連合 CI](../.github/workflows/test-federation.yml)、[peer A](../packages/backend/test-federation/compose.a.yml)、[peer B](../packages/backend/test-federation/compose.b.yml)、[共通 template](../packages/backend/test-federation/compose.tpl.yml)
- [backend CI](../.github/workflows/test-backend.yml)、[unit ランナー](../packages/backend/scripts/run_unit.js)、[e2e ランナー](../packages/backend/scripts/run_e2e.js)、[external e2e](../packages/backend/scripts/run_e2e_bun.js)
- [HTTP 投稿入口](../packages/backend/src/server/rest/note/notes-create.ts)、[共通投稿処理](../packages/backend/src/core/note/NoteCreationService.ts)、[予約投稿](../packages/backend/src/queue/handlers/post-scheduled-note.ts)、[outbox](../packages/backend/src/core/queue/QueueOutboxStore.ts)、[event publish](../packages/backend/src/server/rest/events.ts)
- [runtime](../packages/backend/src/runtime-dependencies.ts)、[Bun SQL](../packages/backend/src/db/bun-sql.ts)、[migration](../packages/backend/src/migration-runner.ts)
- [メモリ計測](../packages/backend/scripts/measure-memory.mts)、[比較手順](../.github/scripts/measure-backend-memory-comparison.mts)、[query counter](../packages/backend/test/query-counter.ts)
- [main HTTP](../packages/frontend/src/utility/misskey-api.ts)、[embed HTTP](../packages/frontend-embed/src/misskey-api.ts)、[SDK HTTP](../packages/misskey-js/src/api.ts)、[timeline](../packages/frontend/src/features/notes/components/MkStreamingNotesTimeline.vue)
