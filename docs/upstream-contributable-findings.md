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

---

## 候補（upstream 未照合・出す前に要確認）

- **follow request の全件受理が無制限並行**: ロック解除等で保留リクエストをまとめて受理する
  際、fork は無制限 `Promise.all` を `promiseLimit` で絞った（commit `ea14cfab5f`,
  `packages/backend/src/server/rest/following.ts`）。upstream の該当フロー
  （`accept-all` / アカウント unlock 時）も無制限に見えるが、今回のパスでは upstream ソースを
  未確認。リクエストが数千件ある鍵アカウントで DB コネクション / 負荷スパイクの恐れ。堅牢性の話。
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
