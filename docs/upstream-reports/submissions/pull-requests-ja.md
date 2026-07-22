# そのまま貼れる PR タイトル・本文（日本語・推奨）

house style に合わせ、タイトルは **conventional-commit の prefix（英語）+ 日本語の要約**。
本文は日本語。CHANGELOG.md の未リリース `### Server` 直下に 1 行追記し、repro をリグレッションテストとして
同梱する。提出前に develop の行番号を再確認すること。

---

## Issue 01 の PR — repliesCount の二重減算

**Title:** `fix(backend): ノート削除の副作用を DELETE の affected 行数でガードする`

**Body:**

Fixes #<issue-01>。

`NoteDeleteService.delete()` は親ノートの `repliesCount` を無条件に減算し、実際の `DELETE` を
（affected を見ずに）メソッド末尾で行っていました。そのため同じ返信に対する 2 本の並行削除で
両方が親を減算し、実際に消すのは片方だけなので、クランプの無い `repliesCount` が負値になりえました。

本 PR は `DELETE` をメソッド先頭に移し、その `affected` を権威的なガードにします。`affected !== 1`
なら別リクエストが既に処理済みなので、副作用を適用する前に return します。`ReactionService.delete()`
の既存ガードと同じ考え方です。

- 同じ返信を並行削除して親の `repliesCount` が `-1` でなく `0` になることを確認するリグレッションテストを追加。
- `UserFollowingService.decrementFollowing()` にも同じ無ガードのパターンがあります
  （`followingCount`/`followersCount`）。別 PR で対応してもよいです。

CHANGELOG.md（`### Server`）: `- Fix: 同じ返信を同時に削除するとノートの repliesCount が負値になりうる問題を修正`

---

## Issue 02 の PR — dateUTC の epoch-0

**Title:** `fix(backend): dateUTC が Unix epoch で例外を投げないようにする`

**Body:**

Fixes #<issue-02>。

`dateUTC()` は引数の数を `if (!d)` で検査していましたが、`d` は `Date.UTC(...)` の戻り値で、
Unix epoch（`Date.UTC(1970, 0)`）では `0` になるため、正当な epoch タイムスタンプが
「wrong number of arguments」を投げていました。`null` になるのは引数個数が不正なときだけなので、
`null` 判定に変えます。

```diff
-	if (!d) throw new Error('wrong number of arguments');
+	if (d === null) throw new Error('wrong number of arguments');
```

- `dateUTC([1970, 0])` が例外を投げず `new Date(0)` を返すリグレッションテストを追加。

内部ヘルパーのみでユーザー影響が無いため、CONTRIBUTING に従い CHANGELOG.md への記載は任意です。

---

## Issue 03 の PR — admin/ad/list の publishing:false ページネーション

**Title:** `fix(backend): admin/ad/list の publishing:false フィルタを括ってページネーションを正す`

**Body:**

Fixes #<issue-03>。

`publishing: false` で `admin/ad/list` は `.andWhere('ad.expiresAt <= :now').orWhere('ad.startsAt > :now')`
をページネーションクエリに繋げていました。TypeORM の `orWhere` は既存条件を括弧で包まないため、
カーソル（`ad.id < :untilId`）が第1アームにしか掛からず、未開始広告（`startsAt > now`）が毎ページ
再出現していました。本 PR は 2 条件を `Brackets` で括り、カーソルがグループ全体と AND されるようにします。

```diff
+import { Brackets } from 'typeorm';
 ...
 			} else if (ps.publishing === false) {
-				query.andWhere('ad.expiresAt <= :now', { now: new Date() }).orWhere('ad.startsAt > :now', { now: new Date() });
+				const now = new Date();
+				query.andWhere(new Brackets(qb => {
+					qb.where('ad.expiresAt <= :now', { now }).orWhere('ad.startsAt > :now', { now });
+				}));
 			}
```

- `publishing: false` でページ送りし、2 ページ目が 1 ページ目を繰り返さないことを確認する
  リグレッションテストを追加。

CHANGELOG.md（`### Server`）: `- Fix: 広告一覧の「未掲載」フィルタで未開始の広告が毎ページ重複する問題を修正`

---

## Issue 04・05 の PR は後追い

これらの修正は設計判断が必要（#04 はデータ移行 + `UNIQUE NULLS NOT DISTINCT`、#05 はユーザー単位の
直列化 / advisory lock）なので、まず修正方針つきで issue を立て、方向性の合意後に PR を出します。
