/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['account'],

	requireCredential: true,
	secure: true,

	description: 'Check push notification registration exists.',

	res: {
		type: 'object',
		optional: false, nullable: true,
		properties: {
			userId: {
				type: 'string',
				optional: false, nullable: false,
			},
			endpoint: {
				type: 'string',
				optional: false, nullable: false,
			},
			sendReadMessage: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
	},
	required: ['endpoint'],
} as const;
