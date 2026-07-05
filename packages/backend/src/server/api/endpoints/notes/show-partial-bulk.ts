/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
				},
				reactions: {
					type: 'object',
					optional: false, nullable: false,
					additionalProperties: {
						type: 'number',
					},
				},
				reactionEmojis: {
					type: 'object',
					optional: false, nullable: false,
					additionalProperties: {
						type: 'string',
					},
				},
			},
		},
	},

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, maxItems: 100, minItems: 1 },
	},
	required: ['noteIds'],
} as const;
