/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['lists', 'account'],

	requireCredential: false,

	kind: 'read:account',

	description: 'Show the properties of a list.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		allOf: [
			{
				type: 'object',
				ref: 'UserList',
			},
			{
				type: 'object',
				optional: false, nullable: false,
				properties: {
					likedCount: {
						type: 'number',
						optional: true, nullable: false,
					},
					isLiked: {
						type: 'boolean',
						optional: true, nullable: false,
					},
				},
			},
		],
	},

	errors: {
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '7bc05c21-1d7a-41ae-88f1-66820f4dc686',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
		forPublic: { type: 'boolean', default: false },
	},
	required: ['listId'],
} as const;
