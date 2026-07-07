/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { usersSearchParamDef } from '@/server/rest/user.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,
	requiredRolePolicy: 'canSearchUsers',

	description: 'Search for users.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'User',
		},
	},
} as const;

export const paramDef = usersSearchParamDef;
