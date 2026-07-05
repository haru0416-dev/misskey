/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';

export const meta = {
	tags: ['meta'],

	requireCredential: true,
	secure: true,

	limit: {
		duration: ms('1hour'),
		max: 50,
	},

	errors: {
		invalidSchema: {
			message: 'External resource returned invalid schema.',
			code: 'EXT_RESOURCE_RETURNED_INVALID_SCHEMA',
			id: 'bb774091-7a15-4a70-9dc5-6ac8cf125856',
		},
		hashUnmached: {
			message: 'Hash did not match.',
			code: 'EXT_RESOURCE_HASH_DIDNT_MATCH',
			id: '693ba8ba-b486-40df-a174-72f8279b56a4',
		},
	},

	res: {
		type: 'object',
		properties: {
			type: {
				type: 'string',
			},
			data: {
				type: 'string',
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string' },
		hash: { type: 'string' },
	},
	required: ['url', 'hash'],
} as const;
