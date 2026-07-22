# #04 registry の同一キーへの並行 set で重複行が生じる

- **対象**: `misskey-dev/misskey` develop (`2026.7.0-beta.2`)、2026-07-22 実ソースで再現
- **種別**: 既知だが未対応（コード内 TODO あり）
- **意図判定**: **既知・未対応**。`models/RegistryItem.ts` にメンテナ自身の TODO
  `// TODO: 同じdomain、同じscope、同じkeyのレコードは二つ以上存在しないように制約付けたい`
  があり、`(userId, domain, scope, key)` に unique 制約が無い。set() は SELECT→INSERT/UPDATE を
  ロック・トランザクション無しで行う。
- **提出先**: 公開 issue + PR（TODO の解消。ただし NULL の扱いに注意、下記）

## Summary

同一 `(userId, domain, scope, key)` への `i/registry/set` が 2 本ほぼ同時に来ると、両方が
「該当行なし」を観測してから両方 INSERT し、**同一キーに重複行が 2 つ**できる。以後の読取は
`getOne()`/`limit(1)` で非決定的にどちらかを返し、remove/update は片方の id しか触らないため、
もう一方が恒久的に影として残りロストアップデート化する。

## Root cause

`packages/backend/src/core/RegistryApiService.ts` の `set()`:

```ts
const existingItem = await query.getOne();   // SELECT (composite key)
if (existingItem) {
	await this.registryItemsRepository.update(existingItem.id, { ... });
} else {
	await this.registryItemsRepository.insert({ id: this.idService.gen(), ... }); // ロック無し
}
```

`packages/backend/src/models/RegistryItem.ts` は `userId`/`scope`/`domain` に個別 `@Index()` を
持つのみで、複合 unique 制約が無い（メンテナの TODO のとおり）。

## Reproduction

`repros/registry-dup.repro.ts`（`MiRegistryItem` + `RegistryApiService.set` の getOne→insert を
実ソースで再現）。並行 set 2 本が「両方とも existing=null を観測」してから各自 INSERT する
並行スケジュールを再現。

**現行 develop の結果（実測）**: 同一キーに対し `rows.length = 2`（`['dark','light']`）→ テスト失敗。

## Expected vs Actual

- Expected: 同一 `(userId, domain, scope, key)` は 1 行のみ
- Actual: 重複行が 2 つ生じる

## Proposed fix（migration が必要なので提案）

複合 unique 制約 + upsert 化。ただし **`domain` が nullable** な点に注意が必要:

- PostgreSQL の通常の UNIQUE は NULL を互いに区別する（複数 NULL を許す）ため、`domain IS NULL`
  の一般ケースでは素の `UNIQUE(userId, domain, scope, key)` では重複を防げない。
- **PostgreSQL 15+ の `UNIQUE NULLS NOT DISTINCT`** を使うか、`COALESCE(domain,'')` の式インデックス、
  あるいは partial index の併用が要る。

方針（PR の骨子）:

1. migration で
   `CREATE UNIQUE INDEX "IDX_registry_item_unique" ON "registry_item" ("userId","domain","scope","key") NULLS NOT DISTINCT;`
   （事前に既存重複を集約するデータ移行が要る）。
2. `RegistryItem.ts` の entity に対応する複合 `@Index({ unique: true })` を追加。
3. `RegistryApiService.set()` を `INSERT ... ON CONFLICT DO UPDATE`（TypeORM の `upsert` / `orUpdate`）に
   変更し、SELECT→分岐のレースを排除。

（repro はレース自体の存在確認まで。migration を含む修正の検証は upstream の migration 基盤が要るため
patch は同梱していない。）
