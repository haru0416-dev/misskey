/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { channelParamDef } from '@/server/rest/favorites.js';

export const meta = {
	tags: ['channels'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:channels',

	errors: {
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: '353c68dd-131a-476c-aa99-88a345e83668',
		},
	},
} as const;

export const paramDef = channelParamDef;
