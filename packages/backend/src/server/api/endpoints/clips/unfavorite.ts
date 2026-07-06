/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { clipIdParamDef } from '@/server/rest/clips.js';

export const meta = {
	tags: ['clip'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:clip-favorite',

	errors: {
		noSuchClip: {
			message: 'No such clip.',
			code: 'NO_SUCH_CLIP',
			id: '2603966e-b865-426c-94a7-af4a01241dc1',
		},

		notFavorited: {
			message: 'You have not favorited the clip.',
			code: 'NOT_FAVORITED',
			id: '90c3a9e8-b321-4dae-bf57-2bf79bbcc187',
		},
	},
} as const;

export const paramDef = clipIdParamDef;
