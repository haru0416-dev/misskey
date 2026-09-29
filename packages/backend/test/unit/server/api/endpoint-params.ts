/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { endpointMetas } from '@/server/api/endpoint-metas.js';

/*
 * 入力の制約 (長さ・件数・範囲・形式・必須) は各契約の paramDef が宣言し、zod が検査する。検査そのものは zod の保証なので
 * エンドポイントごとの e2e では確かめず、全エンドポイントの宣言をここで表として固定する (生成物の api.json は
 * リポジトリに無く、宣言を外しても他では見えない)。宣言を変えたら `vitest -u` で endpoint-params.snap.txt を更新し、
 * 差分をレビューで確かめること。
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
