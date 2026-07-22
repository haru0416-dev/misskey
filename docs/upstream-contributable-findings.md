# upstream (misskey-dev/misskey) へ逆貢献できる発見

作成: 2026-07-22 / 状態: **控えメモ（提出予定は無い）**

Rust 化に向けて TS backend を「仕様の正解」に固める過程で、API 全ルートを突き合わせた。
その大半は **このフォーク自身の移行回帰**（Fastify / NestJS 撤去・TypeORM→drizzle 書き換えで
生まれたもの）で upstream には無関係だが、**ごく一部は upstream Misskey が verbatim で
継承している本物のバグ**だった。このフォークはとっくに upstream 追従を捨てているので
（[project_no_upstream_tracking_policy] 参照）、投げるかどうかは別として、逆方向に
渡せる情報として記録しておく。

## 読み方

- **「upstream 確定」= 2026-07-22 時点で `misskey-dev/misskey` の `develop` の生ソースを
  取得して一致を確認済み**（`raw.githubusercontent.com/misskey-dev/misskey/develop/...`）。
  upstream develop は動くので、実際に出す前に行番号は再確認すること
- fork 側で既に直したものは、fork の該当コミットも併記する
- 末尾に「upstream ではない = 出してはいけないもの」を理由付きで列挙。ここを混同すると
  「upstream のバグだ」と誤って主張することになるので分離した

---

## 1. system-webhook の権限 kind が read/write 逆 【upstream 確定】

**upstream**: `packages/backend/src/server/api/endpoints/admin/system-webhook/{list,show,test}.ts`

| エンドポイント | 実際の性質 | 宣言 `kind` | 妥当か |
|---|---|---|---|
| `admin/system-webhook/list` | 純粋な読み取り | `write:admin:system-webhook` | ✗ read であるべき |
| `admin/system-webhook/show` | 純粋な読み取り | `write:admin:system-webhook` | ✗ read であるべき |
| `admin/system-webhook/test` | テスト送信（副作用あり） | `read:admin:system-webhook` | △ write 寄り |

読み取り 2 つが write を要求し、実アクションが read で済む、という**内部的に矛盾した割当**。
どの規約を採るにせよ少なくとも片方は誤り。

**影響度: 低。** 3 つとも `secure: true` を併せ持つ。`secure` はアクセストークン経由の
呼び出しを一律拒否し、ネイティブ Web クライアントのトークンでしか叩けなくする指定で、
`kind`（アクセストークンが要求する権限スコープ）は実行時に評価されない。よって実害は
生成される権限メタ / `api.json` のスコープ表示の正しさに留まる。ただし将来 `secure` を
外すと権限が誤ったまま露出する潜在バグ。

**fork 側**: `packages/backend/src/server/api/metas/admin-system-webhook.ts` に verbatim 継承。
未修正（upstream と揃えてある）。

## 2. `dateUTC` が Unix epoch ちょうどで誤って例外を投げる 【upstream 確定】

**upstream**: `packages/backend/src/misc/prelude/time.ts:22`

```ts
if (!d) throw new Error('wrong number of arguments');
```

`d` は `Date.UTC(...)` の戻り値。`Date.UTC(1970, 0)` は `0` を返すため、**Unix epoch
（1970-01-01T00:00:00Z）ちょうどの時刻で `!0 === true` となり "引数の数が違う" という
無関係な例外を投げる**。引数数のバリデーションと値のバリデーションが混線している古典的バグ。

**影響度: 極低 / 潜在。** `dateUTC` はチャート系からしか呼ばれず、実運用では現在時刻近辺しか
渡さないので epoch 0 に当たらない。純粋な correctness。

**fork 側の修正**: `Number.isNaN(d)` に置換（commit `8175f8b5ee`）。

## 3. user-list 作成の上限チェックが TOCTOU レース 【upstream 確定】

**upstream**: `packages/backend/src/server/api/endpoints/users/lists/create.ts:61-68`

```ts
const currentCount = await this.userListsRepository.countBy({ userId: me.id });
if (currentCount >= (await this.roleService.getUserPolicies(me.id)).userListLimit) {
	throw new ApiError(meta.errors.tooManyUserLists);
}
const userList = await this.userListsRepository.insertOne({ /* ... */ });
```

**count → 上限判定 → insert がロック無し**。同一ユーザーの並行リクエストが両方とも
`currentCount = limit-1` を見て両方チェックを通過し、両方 insert → `userListLimit` を超える。
list 以外にも「ポリシー上限 - 個数チェック - 追加」の形をしたエンドポイントは同型の疑いがある
（antenna / clip / webhook / メンバー追加系など。今回は list のみ確認）。

**影響度: 低。** ソフト上限のわずかな超過で、セキュリティ影響は無い。同一ユーザーの並行
リクエストが要る。

**fork 側の修正**: 作成トランザクション内で `pg_advisory_xact_lock(hashtext('user-list-limit'),
hashtext(userId))` を取り、チェックと insert を atomic 化（commit `cae180a696`）。
upstream は TypeORM なので直し方は変わる（`SELECT ... FOR UPDATE` / serializable 分離 /
DB 側 unique+件数制約など）が、**レースの所在は同一**。

### 3b. 同型 TOCTOU の高リスク版: ドライブ容量 【upstream 確定・fork でも未修正】

#3 は単発ではなく「**読取 → 上限判定 → 書込 をロックせず行う**」クラスバグ。その最も
stakes の高い実例が**ドライブ容量チェック**で、**fork でも upstream でも未修正**:

- upstream `packages/backend/src/core/DriveService.ts:546-556`
- fork `packages/backend/src/server/rest/drive-file-upload.ts:533-542`

```ts
const usage = await calcDriveUsageOf(user);          // 使用量を読む
if (driveCapacity < usage + info.size) { expireOld() } // 判定（超過なら古いファイルを消して空ける）
// ...ロック無しで insert
```

同一ユーザーの並行アップロードが全て同じ `usage` を読んで全部チェックを通過し、合算で
`driveCapacity` を超える。list の「上限を数個超過」と違い、**ストレージ（ディスク / オブジェクト
ストレージ）の実消費がクォータを超えられる**ぶん stakes が高い。超過幅は概ね
`(並行数 - 1) × ファイルサイズ`（DB プール 30 と `maxFileSizeMb` で上限）。加えて超過時の
`expireOld`（古いファイル削除）が並行すると、同じ古いファイルを二重に対象化して**必要以上に
消す**可能性もある（自分の古いファイルの喪失）。

**影響度: 低〜中。** 自分のクォータ超過なので直接の他者被害は無いが、共有インスタンスでは
ストレージコスト転嫁になる。悪用の旨味は小さい（自分の割当を少し超えるだけ）が、list より実害寄り。
antenna / clip / pin など他の件数上限も同型だが stakes は list と同程度。

## 4. アカウント unlock 時の follow request 一括受理が無制限並行 + 浮いた Promise 【upstream 確定】

**upstream**:
- 引き金 `packages/backend/src/server/api/endpoints/i/update.ts:550-551`
- 本体 `packages/backend/src/core/UserFollowingService.ts:610-623`

鍵アカウント（`isLocked`）が `i/update` で `isLocked: false` に変えると、保留中の全 follow
request を一括受理する。その連鎖が二重に await されていない:

```ts
// i/update.ts:550-551 — unlock を検知して呼ぶが await が無い
if (user.isLocked && ps.isLocked === false) {
	this.userFollowingService.acceptAllFollowRequests(user);
}

// UserFollowingService.ts:615-622 — 全件を for で回すが acceptFollowRequest を await しない
const requests = await this.followRequestsRepository.findBy({ followeeId: user.id });
for (const request of requests) {
	const follower = await this.usersRepository.findOneByOrFail({ id: request.followerId });
	this.acceptFollowRequest(user, follower);   // ← async メソッドを撃ちっぱなし
}
```

`acceptFollowRequest` は `public async`（DB 書き込み + 連合 Accept 配送 + 通知を行う）。
それを await せず for で全件発火するので、**保留件数ぶんの重い処理が一斉に in-flight** になる。
数千件の保留を持つ人気鍵アカウントが unlock すると並行数が青天井になり、DB コネクション /
連合配送の負荷スパイクを招く。加えて各呼び出しが**浮いた Promise**なので、1 件でも reject
すると unhandledRejection になり、残りの受理も保証されない。

**影響度: 低〜中（堅牢性）。** 正しさ・セキュリティの問題ではないが、保留件数に比例して
悪化し、上限が無い。

**波及範囲は「unlock した本人」に閉じない（確認済み）:**
- **クラッシュには昇格しない。** `boot/entry.ts:52` の `unhandledRejection` ハンドラは
  telemetry 記録 + `console.dir` のみで `process.exit` を呼ばない（Node 15+ の
  デフォルト crash を上書き抑止）。よって浮いた Promise の reject はログに消えるだけ
- **ただし共有 DB プールを一時的に枯らす。** プール上限はデフォルト `30`/worker
  （`config-schema.ts:152`）。一斉受理の各 `acceptFollowRequest` は複数の awaited DB 操作を
  持つので、burst 時に 30 コネクションを奪い合う。pg プールは接続要求をキューするため
  **クラッシュはしないが、同 worker 上の他ユーザーの HTTP リクエストが接続待ちで詰まる** →
  unlock 実行中だけ instance-wide にレイテンシが悪化（自己回復）。つまり blast radius は
  「本人の受理が遅い / 一部失敗」に留まらず、同居ユーザーの体感にも及ぶ
- **fire-and-forget の副作用**: `i/update` は受理完了前に成功を返すので、失敗した request は
  無言で保留に残る（unlock 済みなのに未受理が残る軽い不整合。破損ではない）

**fork 側の修正**: `promiseLimit(8)` で並行数を絞り、`Promise.all` で待ち、各件を try/catch で
隔離、さらに受理直前に現存確認（stale request のスキップ）を追加（commit `ea14cfab5f`,
`acceptAllFollowRequestsForHonoApi`）。upstream に出すなら最小形は「`for` を並行数制限付きの
待機に変える + 各件を try/catch で囲む + 引き金側も `await`/`void` を明示」。

---

## 候補（upstream 未照合・出す前に要確認）

- **`secure: true` と `kind` の同時宣言（~11 件）**: `secure` がトークン認証を拒否するので
  `kind` は死んでいる。upstream にも同様に散在するが、意図的な冗長の可能性もあり「バグ」と
  言い切れない。優先度低。

---

## upstream ではない = 逆貢献にならないもの（混同注意）

以下はすべて **このフォークが自身の移行で落とした / 変えた**もの。upstream は正しいか、
そもそも実装が違う。**upstream に報告してはいけない**（的外れになる）。

| 事象 | fork 側の由来 | upstream の状態 |
|---|---|---|
| SSR ルート欠落（channels/announcements/embed） | Fastify→Hono 書き換えで取りこぼし | 正常に存在 |
| 埋め込みページの可視性 / IDOR | fork の SSR 再実装が可視性ゲートを落とした | API 側で担保 |
| ActivityPub オブジェクト URI 欠落（emojis/likes/follows） | fork のルート再実装漏れ | 正常に存在 |
| レートリミット 3 件 / meta 認証宣言誤り 1 件 | 移行時の脱落 | 正常 |
| `ipRateLimit` がキルスイッチ化（`rate-limit.ts:66`） | fork の Hono 用レートリミット書き換え | 別実装（`RateLimiterService`） |
| paramDef 二重定義 8 件 | fork の `metas/` + `rest/` 分割構造の産物 | 単一定義 |
| 公開読み取り 35 ルートが凍結ユーザーでも読める | fork が凍結チェックを落とした | 全 EP で凍結チェック |
| 再帰スキーマ（PageBlock 等）の `$ref` 潰れ | fork の OpenAPI 生成コード | 生成系が別物 |

---

## 照合の出所

- 取得元: `https://raw.githubusercontent.com/misskey-dev/misskey/develop/...`（2026-07-22 取得）
- crates.io 等と同様、GitHub raw も UA 不要だが upstream develop は日々動く。
  **行番号・存在は提出直前に再取得して確認すること**
