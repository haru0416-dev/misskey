/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAccountsFindByEmailParamDef } from '@/server/rest/admin-accounts.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:account',

	errors: {
		userNotFound: {
			message: 'No such user who has the email address.',
			code: 'USER_NOT_FOUND',
			id: 'cb865949-8af5-4062-a88c-ef55e8786d1d',
		},
	},
	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'UserDetailedNotMe',
	},
} as const;

export const paramDef = adminAccountsFindByEmailParamDef;
