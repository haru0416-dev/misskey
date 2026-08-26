/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { parseHonoApiParams } from './validation.js';

type ApiEndpoints = typeof import('../api/endpoints.js').default;

let endpointsPromise: Promise<ApiEndpoints> | undefined;

function getEndpoints(): Promise<ApiEndpoints> {
	return (endpointsPromise ??= import('../api/endpoints.js').then((module) => module.default));
}

export const endpointParamDef = z.object({
	endpoint: z.string(),
});

function apiParamTypeLabel(value: unknown): string {
	if (value != null && typeof value === 'object' && 'type' in value) {
		const type = (value as { type?: unknown }).type;
		if (typeof type === 'string') return type.charAt(0).toUpperCase() + type.slice(1);
	}

	// Zod の `.nullable()` は標準 JSON Schema では `anyOf: [{type: X}, {type: 'null'}]` になり、
	// 直下に `type` を持たない (nullable な値は `{ anyOf: [...] }` になる)。
	// その場合は null 以外の枝から type を拾う。
	if (
		value != null &&
		typeof value === 'object' &&
		'anyOf' in value &&
		Array.isArray((value as { anyOf: unknown }).anyOf)
	) {
		const branches = (value as { anyOf: unknown[] }).anyOf;
		const nonNullBranch = branches.find(
			(branch) => branch != null && typeof branch === 'object' && (branch as { type?: unknown }).type !== 'null',
		);
		if (nonNullBranch != null) return apiParamTypeLabel(nonNullBranch);
	}

	return 'string';
}

/**
 * paramDef が Zod スキーマの場合は JSON Schema (標準形) に変換して properties を取り出す。
 * union 型 (allOf/anyOf 由来) は `properties` を持たないため空になる。
 * allOf のみで直下に properties を持たない paramDef (例: users/show) も同様に扱う。
 */
function paramProperties(params: unknown): Record<string, unknown> {
	if (params != null && typeof params === 'object' && 'safeParse' in params) {
		const jsonSchema = z.toJSONSchema(params as z.ZodType) as { properties?: Record<string, unknown> };
		return jsonSchema.properties ?? {};
	}
	return (params as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
}

export async function handleHonoApiEndpoints(): Promise<string[]> {
	const endpoints = await getEndpoints();
	return endpoints.map((endpoint) => endpoint.name);
}

export async function handleHonoApiEndpoint(body: Record<string, unknown>): Promise<{
	params: {
		name: string;
		type: string;
	}[];
} | null> {
	const params = parseHonoApiParams(endpointParamDef, body);
	const endpoints = await getEndpoints();
	const endpoint = endpoints.find((item) => item.name === params.endpoint);
	if (endpoint == null) return null;

	return {
		params: Object.entries(paramProperties(endpoint.params)).map(([name, value]) => ({
			name,
			type: apiParamTypeLabel(value),
		})),
	};
}
