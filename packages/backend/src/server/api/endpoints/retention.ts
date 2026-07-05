/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['users'],

	requireCredential: false,

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				createdAt: {
					type: 'string',
					format: 'date-time',
				},
				users: {
					type: 'number',
				},
				data: {
					type: 'object',
					additionalProperties: {
						anyOf: [{
							type: 'number',
						}],
					},
				},
			},
			required: [
				'createdAt',
				'users',
				'data',
			],
		},
	},

	allowGet: true,
	cacheSec: 60 * 60,
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;
