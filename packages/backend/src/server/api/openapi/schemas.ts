/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { deepClone, type Cloneable } from '@/misc/clone.js';
import type { Schema } from '@/misc/json-schema.js';
import { refs } from '@/misc/json-schema.js';

/** OpenAPI 3.1 の schema object の緩い構造的表現。厳密な OpenAPI 型を持ち込まず、この変換関数が実際に読み書きするフィールドだけを型付けする。 */
export type OpenApiSchemaObject = {
	type?: string | string[];
	properties?: Record<string, OpenApiSchemaObject>;
	required?: string[];
	items?: OpenApiSchemaObject;
	anyOf?: OpenApiSchemaObject[];
	oneOf?: OpenApiSchemaObject[];
	allOf?: OpenApiSchemaObject[];
	$ref?: string;
	[key: string]: unknown;
};

export function convertSchemaToOpenApiSchema(
	schema: Schema,
	type: 'param' | 'res',
	includeSelfRef: boolean,
): OpenApiSchemaObject {
	// optional, nullable, refはスキーマ定義に含まれないので分離しておく
	const { optional, nullable, ref, selfRef, ...res1 } = schema as Schema & Record<string, unknown>;
	const res = deepClone(res1 as unknown as Cloneable) as OpenApiSchemaObject;

	if (schema.type === 'object' && schema.properties) {
		if (type === 'res') {
			const required = Object.entries(schema.properties)
				.filter(([k, v]) => !v.optional)
				.map(([k]) => k);
			if (required.length > 0) {
				// 空配列は許可されない
				res.required = required;
			}
		}

		res.properties ??= {};
		for (const k of Object.keys(schema.properties)) {
			const property = schema.properties[k];
			if (property == null) throw new Error(`OpenAPI schema property is missing: ${k}`);
			res.properties[k] = convertSchemaToOpenApiSchema(property, type, includeSelfRef);
		}
	}

	if (schema.type === 'array' && schema.items) {
		res.items = convertSchemaToOpenApiSchema(schema.items, type, includeSelfRef);
	}

	for (const o of ['anyOf', 'oneOf', 'allOf'] as const) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (o in schema) res[o] = schema[o]!.map((schema) => convertSchemaToOpenApiSchema(schema, type, includeSelfRef));
	}

	if (type === 'res' && schema.ref && (!schema.selfRef || includeSelfRef)) {
		const $ref = `#/components/schemas/${schema.ref}`;
		if (schema.nullable) {
			res.oneOf = [{ $ref }, { type: 'null' }];
		} else {
			res.$ref = $ref;
		}
		delete res.type;
	} else if (schema.nullable) {
		if (Array.isArray(res.type) && !res.type.includes('null')) {
			res.type.push('null');
		} else if (typeof res.type === 'string') {
			res.type = [res.type, 'null'];
		}
	}

	return res;
}

export function getSchemas(includeSelfRef: boolean) {
	return {
		Error: {
			type: 'object',
			properties: {
				error: {
					type: 'object',
					description: 'An error object.',
					properties: {
						code: {
							type: 'string',
							description: 'A stable machine-readable error code.',
						},
						message: {
							type: 'string',
							description: 'An error message.',
						},
						id: {
							type: 'string',
							description: 'A stable error identifier.',
						},
						kind: {
							type: 'string',
							enum: ['client', 'server', 'permission'],
							description: 'The category of the error.',
						},
						info: {
							description: 'Additional structured details about the error.',
						},
					},
					required: ['code', 'id', 'kind', 'message'],
				},
			},
			required: ['error'],
		},

		...Object.fromEntries(
			Object.entries(refs).map(([key, schema]) => [key, convertSchemaToOpenApiSchema(schema, 'res', includeSelfRef)]),
		),
	};
}
