/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAdCreateParamDef } from '@/server/rest/admin-ad.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:ad',
	res: {
		type: 'object',
		optional: false,
		nullable: false,
		ref: 'Ad',
	},
} as const;

export const paramDef = adminAdCreateParamDef;
