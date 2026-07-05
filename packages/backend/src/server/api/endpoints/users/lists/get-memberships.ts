/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['lists', 'account'],

	requireCredential: false,

	kind: 'read:account',

	errors: {
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '7bc05c21-1d7a-41ae-88f1-66820f4dc686',
		},
	},

	res: {
		type: 'array',
		items: {
			type: 'object',
			nullable: false,
			properties: {
				id: {
					type: 'string',
					format: 'misskey:id',
				},
				createdAt: {
					type: 'string',
					format: 'date-time',
				},
				userId: {
					type: 'string',
					format: 'misskey:id',
				},
				user: {
					type: 'object',
					ref: 'UserLite',
				},
				withReplies: {
					type: 'boolean',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
		forPublic: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['listId'],
} as const;
