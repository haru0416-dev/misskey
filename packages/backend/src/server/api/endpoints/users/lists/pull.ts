/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['lists', 'users'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',

	description: 'Remove a user from a list.',

	errors: {
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '7f44670e-ab16-43b8-b4c1-ccd2ee89cc02',
		},

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '588e7f72-c744-4a61-b180-d354e912bda2',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['listId', 'userId'],
} as const;
