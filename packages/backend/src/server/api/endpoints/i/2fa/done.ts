/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	requireCredential: true,

	secure: true,

	res: {
		type: 'object',
		properties: {
			backupCodes: {
				type: 'array',
				optional: false,
				items: {
					type: 'string',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		token: { type: 'string' },
	},
	required: ['token'],
} as const;
