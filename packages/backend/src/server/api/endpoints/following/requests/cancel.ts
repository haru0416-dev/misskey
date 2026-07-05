/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['following', 'account'],

	requireCredential: true,

	kind: 'write:following',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '4e68c551-fc4c-4e46-bb41-7d4a37bf9dab',
		},

		followRequestNotFound: {
			message: 'Follow request not found.',
			code: 'FOLLOW_REQUEST_NOT_FOUND',
			id: '089b125b-d338-482a-9a09-e2622ac9f8d4',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'UserLite',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;
