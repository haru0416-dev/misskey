/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'ChatMessage',
		},
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '460b3669-81b0-4dc9-a997-44442141bf83',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', minLength: 1, maxLength: 256 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		roomId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['query'],
} as const;
