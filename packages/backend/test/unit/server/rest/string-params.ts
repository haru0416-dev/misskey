/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { castMultipartFields, queryToApiBody } from '@/server/rest/string-params.js';
import type { ApiError } from '@/server/rest/error.js';

describe('server:rest:string-params', () => {
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

	describe('castMultipartFields', () => {
		const schema = z.object({
			folderId: z.string().nullable().optional(),
			name: z.string().nullable().optional(),
			isSensitive: z.boolean().default(false),
			count: z.int().optional(),
		});

		test('真偽値と数値だけ型を戻す', () => {
			const fields: Record<string, unknown> = { isSensitive: 'true', count: '3', name: 'a.png' };
			castMultipartFields(schema, fields);
			expect(fields).toStrictEqual({ isSensitive: true, count: 3, name: 'a.png' });
		});

		test('文字列パラメータは JSON として解釈しない', () => {
			// "null" や "123" を値に持つファイル名を壊さないこと。
			const fields: Record<string, unknown> = { folderId: 'null', name: '123' };
			castMultipartFields(schema, fields);
			expect(fields).toStrictEqual({ folderId: 'null', name: '123' });
		});

		test('宣言された型に解釈できない値は INVALID_PARAM にする', () => {
			// 理由は message ではなく info に入る (クライアントには error.info として返る)。
			const reasonOf = (fields: Record<string, unknown>): unknown => {
				try {
					castMultipartFields(schema, fields);
				} catch (err) {
					return (err as ApiError).info;
				}
				return undefined;
			};
			expect(reasonOf({ isSensitive: 'yes' })).toStrictEqual({
				param: 'isSensitive',
				reason: 'cannot cast to boolean',
			});
			expect(reasonOf({ count: 'abc' })).toStrictEqual({ param: 'count', reason: 'cannot cast to number' });
		});

		test('スキーマに無いキーは触らない', () => {
			const fields: Record<string, unknown> = { unknown: 'true' };
			castMultipartFields(schema, fields);
			expect(fields).toStrictEqual({ unknown: 'true' });
		});
	});
});
