/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['flash'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:flash-likes',

	errors: {
		noSuchFlash: {
			message: 'No such flash.',
			code: 'NO_SUCH_FLASH',
			id: 'afe8424a-a69e-432d-a5f2-2f0740c62410',
		},

		notLiked: {
			message: 'You have not liked that flash.',
			code: 'NOT_LIKED',
			id: '755f25a7-9871-4f65-9f34-51eaad9ae0ac',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		flashId: { type: 'string', format: 'misskey:id' },
	},
	required: ['flashId'],
} as const;
