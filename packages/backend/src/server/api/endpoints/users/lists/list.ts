/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['lists', 'account'],

	requireCredential: false,

	kind: 'read:account',

	description: 'Show all lists that the authenticated user has created.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserList',
		},
	},
	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'a8af4a82-0980-4cc4-a6af-8b0ffd54465e',
		},
		remoteUser: {
			message: 'Not allowed to load the remote user\'s list',
			code: 'REMOTE_USER_NOT_ALLOWED',
			id: '53858f1b-3315-4a01-81b7-db9b48d4b79a',
		},
		invalidParam: {
			message: 'Invalid param.',
			code: 'INVALID_PARAM',
			id: 'ab36de0e-29e9-48cb-9732-d82f1281620d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;
