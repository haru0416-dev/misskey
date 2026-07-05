/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:ad',
	res: {
		type: 'object',
		optional: false,
		nullable: false,
		ref: 'Ad',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string', minLength: 1 },
		memo: { type: 'string' },
		place: { type: 'string' },
		priority: { type: 'string' },
		ratio: { type: 'integer' },
		expiresAt: { type: 'integer' },
		startsAt: { type: 'integer' },
		imageUrl: { type: 'string', minLength: 1 },
		dayOfWeek: { type: 'integer' },
		isSensitive: { type: 'boolean' },
	},
	required: ['url', 'memo', 'place', 'priority', 'ratio', 'expiresAt', 'startsAt', 'imageUrl', 'dayOfWeek'],
} as const;
