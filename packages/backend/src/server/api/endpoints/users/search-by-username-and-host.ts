/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['users'],

	requireCredential: false,

	description: 'Search for a user by username and/or host.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'User',
		},
	},
} as const;

export const paramDef = {
	allOf: [
		{
			anyOf: [
				{
					type: 'object',
					properties: {
						username: { type: 'string', nullable: true },
					},
					required: ['username'],
				},
				{
					type: 'object',
					properties: {
						host: { type: 'string', nullable: true },
					},
					required: ['host'],
				},
			],
		},
		{
			type: 'object',
			properties: {
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
				detail: { type: 'boolean', default: true },
			},
		},
	],
} as const;
