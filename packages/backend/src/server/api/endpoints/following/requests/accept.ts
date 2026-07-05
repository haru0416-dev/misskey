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
			id: '66ce1645-d66c-46bb-8b79-96739af885bd',
		},
		noFollowRequest: {
			message: 'No follow request.',
			code: 'NO_FOLLOW_REQUEST',
			id: 'bcde4f8b-0913-4614-8881-614e522fb041',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;
