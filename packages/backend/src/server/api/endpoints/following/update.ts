/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';

export const meta = {
	tags: ['following', 'users'],

	limit: {
		duration: ms('1hour'),
		max: 100,
	},

	requireCredential: true,

	kind: 'write:following',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '14318698-f67e-492a-99da-5353a5ac52be',
		},

		followeeIsYourself: {
			message: 'Followee is yourself.',
			code: 'FOLLOWEE_IS_YOURSELF',
			id: '4c4cbaf9-962a-463b-8418-a5e365dbf2eb',
		},

		notFollowing: {
			message: 'You are not following that user.',
			code: 'NOT_FOLLOWING',
			id: 'b8dc75cf-1cb5-46c9-b14b-5f1ffbd782c9',
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
		notify: { type: 'string', enum: ['normal', 'none'] },
		withReplies: { type: 'boolean' },
	},
	required: ['userId'],
} as const;
