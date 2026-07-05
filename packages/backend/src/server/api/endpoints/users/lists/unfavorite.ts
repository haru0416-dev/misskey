/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	requireCredential: true,
	kind: 'write:account',
	errors: {
		noSuchList: {
			message: 'No such user list.',
			code: 'NO_SUCH_USER_LIST',
			id: 'baedb33e-76b8-4b0c-86a8-9375c0a7b94b',
		},

		notFavorited: {
			message: 'You have not favorited the list.',
			code: 'ALREADY_FAVORITED',
			id: '835c4b27-463d-4cfa-969b-a9058678d465',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
	},
	required: ['listId'],
} as const;
