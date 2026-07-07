/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { pagePushParamDef } from '@/server/rest/page-push.js';

export const meta = {
	requireCredential: true,
	secure: true,

	errors: {
		noSuchPage: {
			message: 'No such page.',
			code: 'NO_SUCH_PAGE',
			id: '4a13ad31-6729-46b4-b9af-e86b265c2e74',
		},
	},
} as const;

export const paramDef = pagePushParamDef;
