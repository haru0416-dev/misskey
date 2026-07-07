/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { usersPagesParamDef } from '@/server/rest/pages.js';

export const meta = {
	tags: ['users', 'pages'],

	description: 'Show all pages this user created.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Page',
		},
	},
} as const;

export const paramDef = usersPagesParamDef;
