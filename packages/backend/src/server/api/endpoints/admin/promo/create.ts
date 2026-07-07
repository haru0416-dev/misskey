/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminPromoCreateParamDef } from '@/server/rest/promo.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:promo',

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'ee449fbe-af2a-453b-9cae-cf2fe7c895fc',
		},

		alreadyPromoted: {
			message: 'The note has already promoted.',
			code: 'ALREADY_PROMOTED',
			id: 'ae427aa2-7a41-484f-a18c-2c1104051604',
		},
	},
} as const;

export const paramDef = adminPromoCreateParamDef;
