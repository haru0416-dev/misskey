# そのまま貼れる issue 本文（日本語・推奨）

upstream の実運用は日本語が主流（直近 PR/Issue の ~92% が日本語、英語はほぼ依存 bot）なので、
提出は**日本語を推奨**。形式は `.github/ISSUE_TEMPLATE/01_bug-report.yml`（ラベルは英語固定、中身は日本語）。
提出前に develop の行番号を再確認すること。

---

## Issue 01 — 返信ノートの並行削除で親の repliesCount が二重減算される

**Title:** 返信ノートを同時に削除すると親ノートの repliesCount が二重に減算される（負値になりうる）

### 💡 Summary

`NoteDeleteService.delete()` は親ノートの `repliesCount` を**無条件に**減算し、メソッド末尾の
実際の `DELETE` は affected 行数を確認していません。同じ返信ノートに対する削除リクエストが 2 本
ほぼ同時に来ると（削除ボタンの二度押し、クライアントの再送、ユーザー削除とモデレータ削除の競合など）、
両方が返信を非 null で観測して両方が親を減算する一方、実際に行を消すのは片方だけです。
`repliesCount` は `col = col - 1` でクランプが無いため、恒久的にずれて**負値**になりえます。
`notesCount` チャートも同様で、`UserFollowingService.decrementFollowing()` も
`followingCount`/`followersCount` に対して同じ無ガードのパターンを持っています。

なお `ReactionService.delete()` は `result.affected !== 1` を確認してからカウントを調整しており、
まさにこの二重適用を防いでいます。`NoteDeleteService` と `UserFollowingService` にはその
ガードが入っていない、という取りこぼしです。

### 🥰 Expected Behavior

返信 1 件の削除に対応する親 `repliesCount` の減算は 1 回。同じ返信を同時に 2 回消しても、
差し引きの減算は 1 回に収まる。

### 🤬 Actual Behavior

同じ返信を同時に 2 回削除すると親が 2 回減算される。初期値 1 なら結果は `-1`。

### 📝 Steps to Reproduce

1. ノート P と、P への返信 R を作る（`P.repliesCount = 1`）。
2. R に対する `notes/delete` を（ほぼ）同時に 2 本送る。
3. P を見ると `repliesCount` が `0` ではなく `-1` になっている。

DB レベルの最小再現（`packages/backend/test/unit/` に置いて
`NODE_ENV=test npx vitest run --config vitest.config.unit.ts <file>` で実行）: 親 `repliesCount=1`、
返信 1 件を用意し、2 本の並行フローがそれぞれ返信を非 null で観測してから
`notesRepository.decrement({id: parentId}, 'repliesCount', 1)` + `notesRepository.delete({id: replyId})`
を実行する（`NoteDeleteService.delete()` の L66-68 と L113 に対応）。結果は `repliesCount = -1`。

### 🖥️ Server Environment

* Misskey: `develop`（2026.7.0-beta.2）
* サーバー側（バックエンド）の不具合で、フロントには依存しません。

### 原因 / 修正案

`packages/backend/src/core/NoteDeleteService.ts`: `delete()` の先頭で `DELETE` を実行し、その
affected 行数を権威的なガードにする（`affected !== 1` なら早期 return）。そのうえで親の減算と
その他の副作用を行う。`ReactionService` と同じ形です。検証済みの修正 PR を別途出します。

---

## Issue 02 — dateUTC() が Unix epoch ちょうどで例外を投げる

**Title:** dateUTC() が Unix epoch（Date.UTC(1970, 0) === 0）で「wrong number of arguments」を誤って投げる

### 💡 Summary

`misc/prelude/time.ts` の `dateUTC()` は `d = Date.UTC(...)` を計算し、引数の数を
`if (!d) throw new Error('wrong number of arguments')` で検査します。しかし
`Date.UTC(1970, 0)` は `0`（Unix epoch）を返すため、`!0 === true` となり、正当なタイムスタンプに
対して無関係な「wrong number of arguments」を投げます。引数個数の検証と値の検証が混線しています。

実運用では潜在的です（呼び出しは `core/chart/core.ts` のみで、常に「現在時刻」近辺を渡すため
epoch には到達しません）が、ガード自体は誤りです。

### 🥰 Expected Behavior

`dateUTC([1970, 0])` は例外を投げず `new Date(0)`（1970-01-01T00:00:00Z）を返す。

### 🤬 Actual Behavior

`dateUTC([1970, 0])` が `Error: wrong number of arguments` を投げる。

### 📝 Steps to Reproduce

```ts
import { dateUTC } from '@/misc/prelude/time.js';
dateUTC([1970, 0]); // "wrong number of arguments" を投げる
```

### 🖥️ Server Environment

* Misskey: `develop`（2026.7.0-beta.2）

### 原因 / 修正案

`null` になるのは引数個数が不正なときだけなので、ガードは `if (!d)` ではなく `if (d === null)`
（あるいは `if (d === null || Number.isNaN(d))`）にすべきです。1 行の PR を出します。

---

## Issue 03 — admin/ad/list の publishing:false でページネーションが破綻する

**Title:** admin/ad/list（publishing: false）のページネーションで、括弧のない orWhere により未開始広告が毎ページ重複する

### 💡 Summary

`endpoints/admin/ad/list.ts` の `publishing === false` 分岐は、`makePaginationQuery` のあとに次を
繋げています:

```ts
query.andWhere('ad.expiresAt <= :now', { now: new Date() }).orWhere('ad.startsAt > :now', { now: new Date() });
```

`makePaginationQuery` はカーソルを `andWhere('ad.id < :untilId')` として積みますが、TypeORM の
`.orWhere()` は既存条件を括弧で包みません。生成される SQL は:

```sql
WHERE "ad"."id" < :untilId AND "ad"."expiresAt" <= :now OR "ad"."startsAt" > :now
```

SQL の優先順位で `(id < untilId AND expiresAt <= now) OR (startsAt > now)` となり、カーソルが
`startsAt > now` のアームに掛かりません。そのため未開始（予約）広告が毎ページ再出現し、
ページ送りがそこを越えられません。

### 🥰 Expected Behavior

`publishing: false` のページ送りで各広告は 1 回だけ返り、2 ページ目（`untilId` 付き）は 1 ページ目を
繰り返さない。

### 🤬 Actual Behavior

未開始（`startsAt` が未来）の広告が複数あり `limit` がその件数より小さいとき、2 ページ目が
1 ページ目と同一になり、未開始広告が毎ページ再出現する（カーソル無しの 1 ページ目は正しく、
2 ページ目以降で顕在化）。

### 📝 Steps to Reproduce

1. `startsAt` が未来（未開始）で `expiresAt` がさらに未来の広告を 4 件作る。
2. `admin/ad/list` を `publishing: false, limit: 2` で呼ぶ → 1 ページ目。
3. `publishing: false, limit: 2, untilId: <1 ページ目の末尾 id>` で再度呼ぶ → 2 ページ目が 1 ページ目と一致。

### 🖥️ Server Environment

* Misskey: `develop`（2026.7.0-beta.2）

### 原因 / 修正案

`expiresAt <= now OR startsAt > now` を `new Brackets(...)` で 1 グループに括り、カーソルの
`andWhere` とグループ全体を AND させます。検証済みの PR を出します（#12385 で `publishing` を
tri-state 化した際に混入）。

---

## Issue 04 — 同一キーへの並行 i/registry/set で重複行ができる

**Title:** 同一 (userId, domain, scope, key) への並行 i/registry/set で registry の重複行ができる

### 💡 Summary

`RegistryApiService.set()` は `SELECT`（userId/domain/scope/key で）→ 見つかれば `update`・無ければ
`insert` を、ロック/トランザクション無しで行い、`MiRegistryItem` にはそのタプルに対する unique
制約がありません（個別の `@Index()` のみ。既存の
`// TODO: 同じdomain、同じscope、同じkeyのレコードは二つ以上存在しないように制約付けたい` のとおり）。
同一キーへの `set` が 2 本同時に来ると両方が「該当行なし」を観測して両方 `INSERT` し、同一キーに
2 行できます。以後の読取は `getOne()`/`limit(1)` で非決定的にどちらかを返し、remove/update は片方の
id しか触らないため、もう一方が残りロストアップデート化します。

### 🥰 Expected Behavior

同一 `(userId, domain, scope, key)` は高々 1 行。

### 🤬 Actual Behavior

並行 `set` で同一キーに重複行ができる。

### 📝 Steps to Reproduce

1. 同一の scope+key に対する `i/registry/set` を同時に 2 本呼ぶ。
2. その key に対して registry に 2 行できる。

### 🖥️ Server Environment

* Misskey: `develop`（2026.7.0-beta.2）

### 原因 / 修正案

複合 unique 制約を追加し、`set()` を upsert（`INSERT ... ON CONFLICT DO UPDATE`）にします。
ただし `domain` は nullable で、PostgreSQL の通常の UNIQUE は NULL を互いに区別する（複数 NULL を許す）
ため、制約には `UNIQUE NULLS NOT DISTINCT`（PG 15+）か `COALESCE(domain, '')` の式インデックスが要ります。
既存の重複行を集約するデータ移行が先に必要です。

---

## Issue 05 — ドライブ容量チェックが TOCTOU で、並行アップロードが容量を超過できる

**Title:** ドライブ容量チェックが check-then-act で、同一ユーザーの並行アップロードが driveCapacity を超過できる

### 💡 Summary

`DriveService.addFile()` は `usage = calcDriveUsageOf(user)`
（`SUM(size) WHERE userId AND isLink = FALSE`）を読み、`if (driveCapacity < usage + info.size) throw`
で判定し、その後にドライブファイルを insert します。読取と insert の間にロック/直列化が無いため、
同一ユーザーの並行アップロードが全員同じ `usage` を読んでチェックを通過し、合算サイズが
`driveCapacity` を概ね `(並行数 - 1) × ファイルサイズ` ぶん超えられます。件数上限の TOCTOU と違い、
これは**ストレージの実消費**がクォータを超える（実質的なクォータ回避）ものです。

### 🥰 Expected Behavior

同一ユーザーの並行アップロードでも合計使用量が `driveCapacity` を超えない。

### 🤬 Actual Behavior

`usage` を両方が観測してから両方 insert すると、両方が通過して合計が `driveCapacity` を超える。

### 📝 Steps to Reproduce

1. あるユーザーのドライブ容量（ロールポリシー）を小さく設定する。
2. 合計は残容量を超えるが個々は収まる 2 ファイルを同時にアップロードする。
3. 両方成功し、合計使用量が `driveCapacity` を超える。

### 🖥️ Server Environment

* Misskey: `develop`（2026.7.0-beta.2）

### 原因 / 修正案

同一ユーザーの「使用量チェック + insert」を直列化します。例えば insert を含むトランザクション内で
`pg_advisory_xact_lock`（ユーザー id をキーに）を取り、ロック取得後に権威的な再チェックを行う
（物理アップロードはロック外に保つ）。antenna/clip/pin/userList の件数上限も同型ですが stakes は低め。
