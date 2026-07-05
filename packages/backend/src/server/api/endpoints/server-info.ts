/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	requireCredential: false,
	allowGet: true,
	cacheSec: 60 * 1,

	tags: ['meta'],
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			machine: {
				type: 'string',
				nullable: false,
			},
			cpu: {
				type: 'object',
				nullable: false,
				properties: {
					model: {
						type: 'string',
						nullable: false,
					},
					cores: {
						type: 'number',
						nullable: false,
					},
				},
			},
			mem: {
				type: 'object',
				properties: {
					total: {
						type: 'number',
						nullable: false,
					},
				},
			},
			fs: {
				type: 'object',
				nullable: false,
				properties: {
					total: {
						type: 'number',
						nullable: false,
					},
					used: {
						type: 'number',
						nullable: false,
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;
