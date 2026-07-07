/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAdListParamDef } from '@/server/rest/admin-ad.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:ad',
	res: {
		type: 'array',
		optional: false,
		nullable: false,
		items: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'Ad',
		},
	},
} as const;

export const paramDef = adminAdListParamDef;

type AdListParams = {
	limit: number;
	sinceId?: string | null;
	untilId?: string | null;
	sinceDate?: number | null;
	untilDate?: number | null;
	publishing?: boolean | null;
};
