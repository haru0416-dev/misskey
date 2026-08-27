/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { queryToApiBody } from '@/server/rest/query-params.js';

describe('server:rest:query-params', () => {
	const schema = z.object({
		limit: z.int().min(1).max(100).default(10),
		offset: z.int().nullable().default(null),
		host: z.string().nullable().optional(),
		blocked: z.boolean().nullable().optional(),
		// `.nullable()` と同じ意味だが union で書かれている形。両方を null 可として扱う。
		sort: z.union([z.enum(['+a', '-a']), z.null()]).optional(),
		userId: z.string(),
	});

	test('数値パラメータを数値にする', () => {
		expect(queryToApiBody(schema, { limit: '30' })).toStrictEqual({ limit: 30 });
	});

	test('整数にならない値は文字列のまま渡す (zod に期待値つきのエラーを出させる)', () => {
		expect(queryToApiBody(schema, { limit: '1.5' })).toStrictEqual({ limit: '1.5' });
		expect(queryToApiBody(schema, { limit: 'abc' })).toStrictEqual({ limit: 'abc' });
	});

	test('null 可のパラメータだけ "null" を null にする', () => {
		expect(queryToApiBody(schema, { offset: 'null' })).toStrictEqual({ offset: null });
		expect(queryToApiBody(schema, { host: 'null' })).toStrictEqual({ host: null });
		// limit は null 可でないので文字列のまま (スキーマ側で弾かれる)
		expect(queryToApiBody(schema, { limit: 'null' })).toStrictEqual({ limit: 'null' });
	});

	test('union で書かれた null 可も拾う', () => {
		expect(queryToApiBody(schema, { sort: 'null' })).toStrictEqual({ sort: null });
		expect(queryToApiBody(schema, { sort: '+a' })).toStrictEqual({ sort: '+a' });
	});

	test('真偽値は "true"/"false" のときだけ変換する', () => {
		expect(queryToApiBody(schema, { blocked: 'true' })).toStrictEqual({ blocked: true });
		expect(queryToApiBody(schema, { blocked: 'false' })).toStrictEqual({ blocked: false });
		expect(queryToApiBody(schema, { blocked: 'yes' })).toStrictEqual({ blocked: 'yes' });
	});

	test('文字列パラメータとスキーマに無いキーはそのまま', () => {
		expect(queryToApiBody(schema, { userId: 'abc', unknown: '1' })).toStrictEqual({ userId: 'abc', unknown: '1' });
	});

	test('null 可の string に "null" 以外を渡しても壊さない', () => {
		expect(queryToApiBody(schema, { host: 'example.com' })).toStrictEqual({ host: 'example.com' });
	});
});
