/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promoReadParamDef } from '@/server/rest/promo.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'write:account',

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'd785b897-fcd3-4fe9-8fc3-b85c26e6c932',
		},
	},
} as const;

export const paramDef = promoReadParamDef;
