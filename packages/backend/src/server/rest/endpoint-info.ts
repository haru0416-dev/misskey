/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SchemaType } from '@/misc/json-schema.js';
import { parseHonoApiParams } from './validation.js';

type ApiEndpoints = typeof import('../api/endpoints.js').default;

let endpointsPromise: Promise<ApiEndpoints> | undefined;

function getEndpoints(): Promise<ApiEndpoints> {
	return endpointsPromise ??= import('../api/endpoints.js').then(module => module.default);
}

const endpointParamDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
	},
	required: ['endpoint'],
} as const;


function apiParamTypeLabel(value: unknown): string {
	if (value != null && typeof value === 'object' && 'type' in value) {
		const type = (value as { type?: unknown }).type;
		if (typeof type === 'string') return type.charAt(0).toUpperCase() + type.slice(1);
	}

	return 'string';
}

export async function handleHonoApiEndpoints(): Promise<string[]> {
	const endpoints = await getEndpoints();
	return endpoints.map(endpoint => endpoint.name);
}

export async function handleHonoApiEndpoint(body: Record<string, unknown>): Promise<{
	params: {
		name: string;
		type: string;
	}[];
} | null> {
	const params = parseHonoApiParams(endpointParamDef, body);
	const endpoints = await getEndpoints();
	const endpoint = endpoints.find(item => item.name === params.endpoint);
	if (endpoint == null) return null;

	return {
		params: Object.entries(endpoint.params.properties ?? {}).map(([name, value]) => ({
			name,
			type: apiParamTypeLabel(value),
		})),
	};
}
