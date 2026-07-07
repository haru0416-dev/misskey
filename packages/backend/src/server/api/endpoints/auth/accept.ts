/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { authSessionShowParamDef } from '@/server/rest/auth-session.js';

export const meta = {
	tags: ['auth'],

	requireCredential: true,

	secure: true,

	errors: {
		noSuchSession: {
			message: 'No such session.',
			code: 'NO_SUCH_SESSION',
			id: '9c72d8de-391a-43c1-9d06-08d29efde8df',
		},
	},
} as const;

export const paramDef = authSessionShowParamDef;
