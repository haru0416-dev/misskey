/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageCustomEmojis',
	kind: 'write:admin:emoji',

	errors: {
		noSuchEmoji: {
			message: 'No such emoji.',
			code: 'NO_SUCH_EMOJI',
			id: '684dec9d-a8c2-4364-9aa8-456c49cb1dc8',
		},
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '14fb9fd9-0731-4e2f-aeb9-f09e4740333d',
		},
		sameNameEmojiExists: {
			message: 'Emoji that have same name already exists.',
			code: 'SAME_NAME_EMOJI_EXISTS',
			id: '7180fe9d-1ee3-bff9-647d-fe9896d2ffb8',
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
						id: { type: 'string', format: 'misskey:id' },
					},
					required: ['id'],
				},
				{
					type: 'object',
					properties: {
						name: { type: 'string', pattern: '^[a-zA-Z0-9_]+$' },
					},
					required: ['name'],
				},
			],
		},
		{
			type: 'object',
			properties: {
				fileId: { type: 'string', format: 'misskey:id' },
				category: {
					type: 'string',
					nullable: true,
					description: 'Use `null` to reset the category.',
				},
				aliases: { type: 'array', items: {
					type: 'string',
				} },
				license: { type: 'string', nullable: true },
				isSensitive: { type: 'boolean' },
				localOnly: { type: 'boolean' },
				roleIdsThatCanBeUsedThisEmojiAsReaction: { type: 'array', items: {
					type: 'string',
				} },
			},
		},
	],
} as const;
