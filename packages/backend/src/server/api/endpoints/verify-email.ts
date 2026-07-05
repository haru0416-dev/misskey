/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	requireCredential: false,

	tags: ['account'],

	errors: {
		noSuchCode: {
			message: 'No such code.',
			code: 'NO_SUCH_CODE',
			id: '97c1f576-e4b8-4b8a-a6dc-9cb65e7f6f85',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		code: { type: 'string' },
	},
	required: ['code'],
} as const;
