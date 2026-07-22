# #03 admin 広告一覧 `publishing:false` のページネーションで未開始広告が毎ページ重複する

- **対象**: `misskey-dev/misskey` develop (`2026.7.0-beta.2`)、2026-07-22 実ソースで再現
- **種別**: 気づかれていないバグ
- **意図判定**: **未報告バグ**。TypeORM の `.orWhere()` が既存 WHERE を括弧で包まない仕様に
  起因する典型的なクエリ組み立てミス。`#12385`「広告掲載ページにてfilterをわかりやすく」で
  `publishing` を tri-state 化した際に `orWhere` を追加して混入し、以来放置。fix PR は見つからず。
- **提出先**: 公開 issue + PR

## Summary

`admin/ad/list` を `publishing: false`（＝現在掲載中でない＝期限切れ or 未開始）で呼び、
2 ページ目以降を `untilId` 付きで読むと、**未開始（`startsAt > now`）の予約広告がカーソルを
無視して毎ページ再出現**し、ページ送りがそこを越えられない。1 ページ目（カーソル無し）は正しく、
2 ページ目以降でのみ顕在化する。

## Root cause

`packages/backend/src/server/api/endpoints/admin/ad/list.ts`:

```ts
const query = this.queryService.makePaginationQuery(this.adsRepository.createQueryBuilder('ad'), ps.sinceId, ps.untilId, ...);
// ...
} else if (ps.publishing === false) {
	query.andWhere('ad.expiresAt <= :now', { now: new Date() }).orWhere('ad.startsAt > :now', { now: new Date() });
}
```

`makePaginationQuery` はカーソルを `andWhere('ad.id < :untilId')` として積む。その後
`.andWhere(expired).orWhere(startsAt>now)` を重ねるが、TypeORM は `orWhere` で既存条件を
括弧で包まないため、生成される WHERE は:

```sql
WHERE "ad"."id" < :untilId AND "ad"."expiresAt" <= :now OR "ad"."startsAt" > :now
```

SQL の優先順位で `(id < untilId AND expiresAt <= now) OR (startsAt > now)` と解釈され、
第2アーム `startsAt > now` に**カーソルが掛からない**。

## Reproduction

`repros/ad-list-pagination.repro.ts`（`MiAd` + `QueryService.makePaginationQuery` 相当を実ソースで再現）。
未開始広告 4 件を作り、`publishing:false`・limit 2 で 1→2 ページ目を読む。

**現行 develop の結果（実測）**:
- 生成 SQL: `... WHERE "ad"."id" < :untilId AND "ad"."expiresAt" <= :now OR "ad"."startsAt" > :now ORDER BY "ad"."id" DESC LIMIT 2`（**括弧なし**）
- `page1 = [scheduled-3, scheduled-2]`、`page2 = [scheduled-3, scheduled-2]`（完全重複）→ テスト失敗

## Expected vs Actual

- Expected: 2 ページ目は 1 ページ目と重複しない（カーソルより前の広告のみ返る）
- Actual: 未開始広告が毎ページ再出現し、ページ送りが進まない

## Proposed fix

`expired OR notStarted` を `Brackets` で 1 つの条件に括り、カーソルの `andWhere` と正しく
AND させる。`patches/03-ad-list-pagination.patch`（検証済み: 適用後に overlap が消える）:

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

生成 SQL が `... id < :untilId AND ("ad"."expiresAt" <= :now OR "ad"."startsAt" > :now)` になり、
カーソルが両アームに掛かる。
