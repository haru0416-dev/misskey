/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['role', 'users'],

	requireCredential: false,

	errors: {
		noSuchRole: {
			message: 'No such role.',
			code: 'NO_SUCH_ROLE',
			id: 'de5502bf-009a-4639-86c1-fec349e46dcb',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Role',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roleId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roleId'],
} as const;
