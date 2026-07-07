/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { userIdParamDef } from '@/server/rest/account-mutes.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	prohibitMoved: true,

	kind: 'write:mutes',

	limit: {
		duration: ms('1hour'),
		max: 20,
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '5e0a5dff-1e94-4202-87ae-4d9c89eb2271',
		},

		muteeIsYourself: {
			message: 'Mutee is yourself.',
			code: 'MUTEE_IS_YOURSELF',
			id: '37285718-52f7-4aef-b7de-c38b8e8a8420',
		},

		alreadyMuting: {
			message: 'You are already muting that user.',
			code: 'ALREADY_MUTING',
			id: 'ccfecbe4-1f1c-4fc2-8a3d-c3ffee61cb7b',
		},
	},
} as const;

export const paramDef = userIdParamDef;
