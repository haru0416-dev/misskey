# #02 `dateUTC` が Unix epoch ちょうどの時刻で誤って例外を投げる

- **対象**: `misskey-dev/misskey` develop (`2026.7.0-beta.2`)、2026-07-22 実ソースで再現
- **種別**: 気づかれていないバグ（潜在・現状の呼び出し経路では発火しない）
- **意図判定**: **未報告バグ**。`!d`（falsy 判定）を「引数の数が違う」判定に誤用している。
  該当 issue は見つからず。ただし現状 `dateUTC` の呼び出しは `core/chart/core.ts` のみで、
  いずれも現在時刻近辺しか渡さないため Unix epoch には到達せず、**実運用では発火しない**。
- **提出先**: 公開 issue + PR（軽微。correctness/堅牢性の改善）

## Summary

`dateUTC` は引数配列から `Date.UTC(...)` を計算し、`if (!d)` で不正を弾く。しかし
`Date.UTC(1970, 0)` は `0`（Unix epoch）を返すため、**epoch ちょうどの時刻で `!0 === true`**
となり "wrong number of arguments" という無関係な例外を投げる。引数個数のバリデーションと
値のバリデーションが混線している古典的な falsy-zero バグ。

## Root cause

`packages/backend/src/misc/prelude/time.ts`:

```ts
export function dateUTC(time: number[]): Date {
	const d =
		time.length === 2 ? Date.UTC(time[0], time[1])
		: /* ... */
		: null;

	if (!d) throw new Error('wrong number of arguments');   // ← d === 0 (epoch) でも throw
	return new Date(d);
}
```

引数個数が不正なときだけ `d` は `null` になる。`0` は正当な戻り値（1970-01-01T00:00:00Z）
なのに falsy 判定で弾かれる。

## Reproduction

`repros/dateutc.repro.ts`（純関数・DB 不要）:

```ts
expect(() => dateUTC([1970, 0])).not.toThrow();
expect(dateUTC([1970, 0]).getTime()).toBe(0);
```

**現行 develop の結果（実測）**: `Error: wrong number of arguments` が投げられテスト失敗。

## Expected vs Actual

- Expected: `dateUTC([1970, 0])` は `new Date(0)` を返す（例外を投げない）
- Actual: `Error: wrong number of arguments` を throw

## Proposed fix

引数個数の判定なので `null` かどうかで判定する。`patches/02-dateutc.patch`（検証済み: 適用後に
repro が通る）:

```diff
-	if (!d) throw new Error('wrong number of arguments');
+	if (d === null) throw new Error('wrong number of arguments');
```

（`d` は数値引数からの `Date.UTC` 結果なので NaN にはならないが、より堅牢にするなら
`if (d === null || Number.isNaN(d))` でもよい。）
