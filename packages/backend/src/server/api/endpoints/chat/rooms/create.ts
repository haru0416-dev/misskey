/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1day'),
		max: 10,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoom',
	},

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', maxLength: 256 },
		description: { type: 'string', maxLength: 1024 },
	},
	required: ['name'],
} as const;
