/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { iPinOrUnpinParamDef } from '@/server/rest/account-pin.js';

export const meta = {
	tags: ['account', 'notes'],

	requireCredential: true,
	prohibitMoved: true,

	kind: 'write:account',

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '56734f8b-3928-431e-bf80-6ff87df40cb3',
		},

		pinLimitExceeded: {
			message: 'You can not pin notes any more.',
			code: 'PIN_LIMIT_EXCEEDED',
			id: '72dab508-c64d-498f-8740-a8eec1ba385a',
		},

		alreadyPinned: {
			message: 'That note has already been pinned.',
			code: 'ALREADY_PINNED',
			id: '8b18c2b7-68fe-4edb-9892-c0cbaeb6c913',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'MeDetailed',
	},
} as const;

export const paramDef = iPinOrUnpinParamDef;
