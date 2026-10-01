/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { z } from 'zod';
import { invalidParamError } from './error.js';

type Accepts = { number: boolean; boolean: boolean; null: boolean };

/**
 * ラッパー (optional / nullable / default / union) を剥がして、そのフィールドが
 * 受け付ける素の型を調べる。`z.enum([...]).nullable()` と
 * `z.union([z.enum([...]), z.null()])` は同じ意味なので、どちらも null 可として扱う。
 */
function acceptsOf(field: z.ZodType): Accepts {
	const accepts: Accepts = { number: false, boolean: false, null: false };

	const visit = (schema: z.ZodType): void => {
		const def = (schema as { def?: { type?: string; innerType?: z.ZodType; options?: z.ZodType[] } }).def;
		switch (def?.type) {
			case 'nullable':
				accepts.null = true;
				if (def.innerType) {
					visit(def.innerType);
				}
				return;
			case 'optional':
			case 'default':
			case 'prefault':
			case 'nonoptional':
				if (def.innerType) {
					visit(def.innerType);
				}
				return;
			case 'union':
				for (const option of def.options ?? []) {
					visit(option);
				}
				return;
			case 'null':
				accepts.null = true;
				return;
			case 'number':
			case 'int':
				accepts.number = true;
				return;
			case 'boolean':
				accepts.boolean = true;
				return;
			default:
				return;
		}
	};
	visit(field);

	return accepts;
}

/**
 * 数値は整数として解釈できる文字列だけ変換し、真偽値・null はスキーマが許可する場合だけ変換する。
 * 変換できない値は文字列のまま渡し、型の不一致は Zod の検証で報告する。
 */
export function queryToApiBody(schema: z.ZodObject, query: Record<string, string>): Record<string, unknown> {
	const shape = schema.shape as Record<string, z.ZodType | undefined>;
	const body: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(query)) {
		const field = shape[key];
		if (field === undefined) {
			body[key] = value;
			continue;
		}

		const accepts = acceptsOf(field);
		if (accepts.null && value === 'null') {
			body[key] = null;
		} else if (accepts.number) {
			const numeric = Number(value);
			body[key] = Number.isInteger(numeric) ? numeric : value;
		} else if (accepts.boolean && (value === 'true' || value === 'false')) {
			body[key] = value === 'true';
		} else {
			body[key] = value;
		}
	}

	return body;
}

/**
 * 数値・真偽値を許可するフィールドの文字列を JSON として解釈し、フォームを直接更新する。
 * 不正な JSON はここで拒否し、変換後の型・値の検証は Zod に任せる。
 */
export function castMultipartFields(schema: z.ZodObject, fields: Record<string, unknown>): void {
	const shape = schema.shape as Record<string, z.ZodType | undefined>;

	for (const [key, value] of Object.entries(fields)) {
		if (typeof value !== 'string') {
			continue;
		}

		const field = shape[key];
		if (field === undefined) {
			continue;
		}

		const accepts = acceptsOf(field);
		if (!accepts.number && !accepts.boolean) {
			continue;
		}

		try {
			fields[key] = JSON.parse(value);
		} catch {
			throw invalidParamError({ param: key, reason: `cannot cast to ${accepts.number ? 'number' : 'boolean'}` });
		}
	}
}
