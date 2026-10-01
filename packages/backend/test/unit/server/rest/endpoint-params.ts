/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { endpointMetas } from '@/server/rest/endpoint-metas.js';

/*
 * paramDef が宣言する入力制約 (長さ・件数・範囲・形式・必須) を固定し、意図しない API 契約の変更を検出する。
 * この表は実際のリクエストの検証を代替しない。共通の検証経路は e2e/api.ts、個別の挙動は各 e2e で確かめる。
 * 宣言を変更する場合は endpoint-params.snap.txt の差分を API 契約の変更としてレビューする。
 */

const constraintKeys = [
	'minLength',
	'maxLength',
	'minimum',
	'maximum',
	'exclusiveMinimum',
	'exclusiveMaximum',
	'minItems',
	'maxItems',
	'uniqueItems',
	'pattern',
	'format',
	'enum',
	'const',
] as const;

type JsonSchema = {
	type?: string | string[];
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema;
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	allOf?: JsonSchema[];
	[key: string]: unknown;
};

/** 制約を持つ位置だけを `path: key=value ...` の行にする。 */
function collectConstraints(schema: JsonSchema, path: string, lines: string[]): void {
	const found = constraintKeys
		.filter((key) => schema[key] !== undefined)
		.map((key) => `${key}=${JSON.stringify(schema[key])}`);
	if (schema.required != null && schema.required.length > 0) {
		found.push(`required=${JSON.stringify([...schema.required].sort())}`);
	}
	if (found.length > 0) {
		lines.push(`${path}: ${found.join(' ')}`);
	}
	for (const [name, child] of Object.entries(schema.properties ?? {})) {
		collectConstraints(child, `${path}.${name}`, lines);
	}
	if (schema.items != null) {
		collectConstraints(schema.items, `${path}[]`, lines);
	}
	for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
		schema[key]?.forEach((child, index) => collectConstraints(child, `${path}<${key}${index}>`, lines));
	}
}

describe('エンドポイントの入力の制約', () => {
	test('全エンドポイントの制約が固定した表と一致する', async () => {
		const lines: string[] = [];
		for (const [name, contract] of Object.entries(endpointMetas).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
			const schema = z.toJSONSchema(contract.paramDef as z.ZodType, { io: 'input' }) as JsonSchema;
			collectConstraints(schema, name, lines);
		}
		await expect(`${lines.join('\n')}\n`).toMatchFileSnapshot('./endpoint-params.snap.txt');
	});
});
