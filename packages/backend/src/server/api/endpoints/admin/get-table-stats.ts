/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:table-stats',

	tags: ['admin'],

	res: {
		type: 'object',
		optional: false, nullable: false,
		additionalProperties: {
			type: 'object',
			properties: {
				count: {
					type: 'number',
				},
				size: {
					type: 'number',
				},
			},
			required: ['count', 'size'],
		},
		example: {
			migrations: {
				count: 66,
				size: 32768,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;
