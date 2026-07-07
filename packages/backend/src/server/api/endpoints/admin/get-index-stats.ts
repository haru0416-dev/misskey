/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminStatsParamDef } from '@/server/rest/admin-stats.js';

export const meta = {
	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:index-stats',

	tags: ['admin'],
	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				tablename: { type: 'string' },
				indexname: { type: 'string' },
			},
		},
	},
} as const;

export const paramDef = adminStatsParamDef;
