/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { channelMuteCreateParamDef } from '@/server/rest/channels.js';

export const meta = {
	tags: ['channels', 'mute'],

	requireCredential: true,
	prohibitMoved: true,

	kind: 'write:channels',

	errors: {
		noSuchChannel: {
			message: 'No such Channel.',
			code: 'NO_SUCH_CHANNEL',
			id: '7174361e-d58f-31d6-2e7c-6fb830786a3f',
		},

		alreadyMuting: {
			message: 'You are already muting that user.',
			code: 'ALREADY_MUTING_CHANNEL',
			id: '5a251978-769a-da44-3e89-3931e43bb592',
		},

		expiresAtIsPast: {
			message: 'Cannot set past date to "expiresAt".',
			code: 'EXPIRES_AT_IS_PAST',
			id: '42b32236-df2c-a45f-fdbf-def67268f749',
		},
	},
} as const;

export const paramDef = channelMuteCreateParamDef;
