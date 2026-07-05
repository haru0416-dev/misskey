/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['clip'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:clip-favorite',

	errors: {
		noSuchClip: {
			message: 'No such clip.',
			code: 'NO_SUCH_CLIP',
			id: '4c2aaeae-80d8-4250-9606-26cb1fdb77a5',
		},

		alreadyFavorited: {
			message: 'The clip has already been favorited.',
			code: 'ALREADY_FAVORITED',
			id: '92658936-c625-4273-8326-2d790129256e',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		clipId: { type: 'string', format: 'misskey:id' },
	},
	required: ['clipId'],
} as const;
