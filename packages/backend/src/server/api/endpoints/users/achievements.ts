/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { usersAchievementsParamDef } from '@/server/rest/users.js';

export const meta = {
	requireCredential: false,

	res: {
		type: 'array',
		items: {
			ref: 'Achievement',
		},
	},
} as const;

export const paramDef = usersAchievementsParamDef;
