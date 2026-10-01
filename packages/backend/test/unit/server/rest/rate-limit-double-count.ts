/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { endpointMetas } from '@/server/api/endpoint-metas.js';

const endpointsDir = fileURLToPath(new URL('../../../../src/server/rest/endpoints/', import.meta.url));

test('契約の実装が meta の回数制限と同じ枠を数え直していない', () => {
	// 共通 guard は meta.limit を同じキー (エンドポイント名) で数える。実装で同じ枠をもう一度数えると、
	// 1 回目の記録が 2 回目の判定に入り、本番では毎回 429 になる。
	// meta が間隔 (minInterval) だけを宣言し、件数の上限を処理の途中で数えるのは許す。
	const calls: string[] = [];
	const errors: string[] = [];
	for (const file of readdirSync(endpointsDir).filter((name) => name.endsWith('.ts'))) {
		const source = readFileSync(endpointsDir + file, 'utf8');
		for (const match of source.matchAll(/assertApiRateLimitForUser\(\s*deps,\s*'([^']+)'/g)) {
			const endpoint = match[1]!;
			calls.push(endpoint);
			const meta = Object.hasOwn(endpointMetas, endpoint)
				? (endpointMetas[endpoint as keyof typeof endpointMetas].meta as {
						limit?: { duration?: number; max?: number };
					})
				: undefined;
			if (meta?.limit?.duration != null || meta?.limit?.max != null) {
				errors.push(`${file}: ${endpoint} は meta の limit と同じ枠を実装でも数えている`);
			}
		}
	}
	// 抽出が空振りしていないことを、現存する唯一の例外で確かめる。
	expect(calls).toContain('i/import-antennas');
	expect(errors).toStrictEqual([]);
});
