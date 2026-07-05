/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 循環参照を回避
let endpointsPromise: Promise<typeof import('../endpoints.js').default> | undefined;

function getEndpoints() {
	return endpointsPromise ??= import('../endpoints.js').then(module => module.default);
}

export const meta = {
	requireCredential: false,

	tags: ['meta'],

	res: {
		type: 'object',
		nullable: true,
		properties: {
			params: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						type: { type: 'string' },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
	},
	required: ['endpoint'],
} as const;
