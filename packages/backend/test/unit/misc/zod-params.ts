/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { misskeyId, paginationParams, uniqueItems } from '@/misc/zod-params.js';
import { birthdaySchema } from '@/models/User.js';

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
		test('説明を除けばインラインで書いた場合と同じ JSON Schema になる', () => {
			const shared = z.object({ limit: z.int().min(1).max(100).default(10), ...paginationParams });
			const inline = z.object({
				limit: z.int().min(1).max(100).default(10),
				sinceId: misskeyId().optional(),
				untilId: misskeyId().optional(),
				sinceDate: z.int().optional(),
				untilDate: z.int().optional(),
			});
			const stripDescriptions = (schema: z.ZodObject): string => {
				const json = z.toJSONSchema(schema, { io: 'input' }) as {
					properties?: Record<string, Record<string, unknown>>;
				};
				for (const property of Object.values(json.properties ?? {})) delete property['description'];
				// キー順まで一致していないと api.json が変わる。
				return JSON.stringify(json);
			};
			expect(stripDescriptions(shared)).toBe(stripDescriptions(inline));
		});

		test('4 つとも OpenAPI に説明が載る', () => {
			// ここが空になると、生成される misskey-js の型から since/until の意味が消える。
			const json = z.toJSONSchema(z.object({ ...paginationParams }), { io: 'input' }) as {
				properties?: Record<string, { description?: string }>;
			};
			for (const key of ['sinceId', 'untilId', 'sinceDate', 'untilDate']) {
				expect(json.properties?.[key]?.description, key).toBeTruthy();
			}
		});

		test('4 つとも省略可能', () => {
			expect(z.object({ ...paginationParams }).safeParse({}).success).toBe(true);
		});

		test('ID は misskey:id 形式を強制する', () => {
			expect(z.object({ ...paginationParams }).safeParse({ sinceId: 'ab-cd' }).success).toBe(false);
		});
	});

	describe('birthdaySchema', () => {
		test('実在する日付を通す', () => {
			expect(birthdaySchema.safeParse('2000-06-15').success).toBe(true);
			expect(birthdaySchema.safeParse('2000-02-29').success).toBe(true);
		});

		test('存在しない日付を弾く', () => {
			expect(birthdaySchema.safeParse('2000-02-30').success).toBe(false);
			expect(birthdaySchema.safeParse('2001-02-29').success).toBe(false);
			expect(birthdaySchema.safeParse('9999-99-99').success).toBe(false);
		});

		test('YYYY-MM-DD 以外の形を弾く', () => {
			expect(birthdaySchema.safeParse('2000-6-15').success).toBe(false);
			expect(birthdaySchema.safeParse('2000-06-15T00:00:00Z').success).toBe(false);
		});
	});
});
