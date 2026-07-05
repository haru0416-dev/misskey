/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	requireCredential: true,
	kind: 'write:account',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		key: { type: 'string', minLength: 1 },
		value: {},
		scope: { type: 'array', default: [], items: {
			type: 'string', pattern: /^[a-zA-Z0-9_]+$/.toString().slice(1, -1),
		} },
		domain: { type: 'string', nullable: true },
	},
	required: ['key', 'value', 'scope'],
} as const;
