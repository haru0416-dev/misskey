/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { misskeyId, paginationParams, uniqueItems } from '@/misc/zod-params.js';

describe('misc:zod-params', () => {
	describe('uniqueItems', () => {
		const schema = uniqueItems(z.array(z.string()).min(1).max(3));

		test('重複があれば弾く', () => {
			expect(schema.safeParse(['a', 'a']).success).toBe(false);
			expect(schema.safeParse(['a', 'b']).success).toBe(true);
		});

		test('配列の長さ制約を消さない', () => {
			expect(schema.safeParse([]).success).toBe(false);
			expect(schema.safeParse(['a', 'b', 'c', 'd']).success).toBe(false);
		});

		test('重複禁止が JSON Schema に載る', () => {
			// refine の中身は toJSONSchema からは見えないので、meta 経由で載っていることを見る。
			// ここが落ちると OpenAPI (/api.json) から制約が黙って消える。
			const json = z.toJSONSchema(schema, { io: 'input' });
			expect(json).toMatchObject({ type: 'array', minItems: 1, maxItems: 3, uniqueItems: true });
		});

		test('optional で包んでも JSON Schema に残る', () => {
			const json = z.toJSONSchema(z.object({ ids: schema.optional() }), { io: 'input' });
			expect(json.properties?.['ids']).toMatchObject({ uniqueItems: true });
		});
	});

	describe('paginationParams', () => {
		test('展開してもインラインで書いた場合と同じ JSON Schema になる', () => {
			const shared = z.object({ limit: z.int().min(1).max(100).default(10), ...paginationParams });
			const inline = z.object({
				limit: z.int().min(1).max(100).default(10),
				sinceId: misskeyId().optional(),
				untilId: misskeyId().optional(),
				sinceDate: z.int().optional(),
				untilDate: z.int().optional(),
			});
			// キー順まで一致していないと api.json が変わる。
			expect(JSON.stringify(z.toJSONSchema(shared, { io: 'input' }))).toBe(
				JSON.stringify(z.toJSONSchema(inline, { io: 'input' })),
			);
		});

		test('4 つとも省略可能', () => {
			expect(z.object({ ...paginationParams }).safeParse({}).success).toBe(true);
		});

		test('ID は misskey:id 形式を強制する', () => {
			expect(z.object({ ...paginationParams }).safeParse({ sinceId: 'ab-cd' }).success).toBe(false);
		});
	});
});
