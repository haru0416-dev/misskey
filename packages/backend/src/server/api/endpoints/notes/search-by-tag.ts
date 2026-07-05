/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['notes', 'hashtags'],

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
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
						tag: { type: 'string', minLength: 1 },
					},
					required: ['tag'],
				},
				{
					type: 'object',
					properties: {
						query: {
							type: 'array',
							description: 'The outer arrays are chained with OR, the inner arrays are chained with AND.',
							items: {
								type: 'array',
								items: {
									type: 'string',
									minLength: 1,
								},
								minItems: 1,
							},
							minItems: 1,
						},
					},
					required: ['query'],
				},
			],
		},
		{
			type: 'object',
			properties: {
				reply: { type: 'boolean', nullable: true, default: null },
				renote: { type: 'boolean', nullable: true, default: null },
				withFiles: {
					type: 'boolean',
					default: false,
					description: 'Only show notes that have attached files.',
				},
				poll: { type: 'boolean', nullable: true, default: null },
				sinceId: { type: 'string', format: 'misskey:id' },
				untilId: { type: 'string', format: 'misskey:id' },
				sinceDate: { type: 'integer' },
				untilDate: { type: 'integer' },
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
			},
		},
	],
} as const;
