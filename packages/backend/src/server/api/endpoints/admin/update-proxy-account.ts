/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminUpdateProxyAccountParamDef } from '@/server/rest/admin-accounts.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:account',

	res: {
		type: 'object',
		nullable: false, optional: false,
		ref: 'UserDetailed',
	},
} as const;

export const paramDef = adminUpdateProxyAccountParamDef;
