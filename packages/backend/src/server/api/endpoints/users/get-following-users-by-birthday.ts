/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'read:account',

	description: 'Retrieve users who have a birthday on the specified range.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'misskey:id',
				},
				birthday: {
					type: 'string',
					optional: false, nullable: false,
				},
				user: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'UserLite',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		birthday: {
			oneOf: [{
				type: 'object',
				properties: {
					month: { type: 'integer', minimum: 1, maximum: 12 },
					day: { type: 'integer', minimum: 1, maximum: 31 },
				},
				required: ['month', 'day'],
			}, {
				type: 'object',
				properties: {
					begin: {
						type: 'object',
						properties: {
							month: { type: 'integer', minimum: 1, maximum: 12 },
							day: { type: 'integer', minimum: 1, maximum: 31 },
						},
						required: ['month', 'day'],
					},
					end: {
						type: 'object',
						properties: {
							month: { type: 'integer', minimum: 1, maximum: 12 },
							day: { type: 'integer', minimum: 1, maximum: 31 },
						},
						required: ['month', 'day'],
					},
				},
				required: ['begin', 'end'],
			}],
		},
	},
	required: ['birthday'],
} as const;
