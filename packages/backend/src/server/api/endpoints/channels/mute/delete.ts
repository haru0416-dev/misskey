/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['channels', 'mute'],

	requireCredential: true,
	prohibitMoved: true,

	kind: 'write:channels',

	errors: {
		noSuchChannel: {
			message: 'No such Channel.',
			code: 'NO_SUCH_CHANNEL',
			id: 'e7998769-6e94-d9c2-6b8f-94a527314aba',
		},

		notMuting: {
			message: 'You are not muting that channel.',
			code: 'NOT_MUTING_CHANNEL',
			id: '14d55962-6ea8-d990-1333-d6bef78dc2ab',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
	},
	required: ['channelId'],
} as const;
