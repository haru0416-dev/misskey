/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { userIdParamDef } from '@/server/rest/account-mutes.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'write:mutes',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '9b6728cf-638c-4aa1-bedb-e07d8101474d',
		},

		muteeIsYourself: {
			message: 'Mutee is yourself.',
			code: 'MUTEE_IS_YOURSELF',
			id: '619b1314-0850-4597-a242-e245f3da42af',
		},

		notMuting: {
			message: 'You are not muting that user.',
			code: 'NOT_MUTING',
			id: '2e4ef874-8bf0-4b4b-b069-4598f6d05817',
		},
	},
} as const;

export const paramDef = userIdParamDef;
