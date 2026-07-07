/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { myAppsParamDef } from '@/server/rest/app.js';

export const meta = {
	tags: ['account', 'app'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'App',
		},
	},
} as const;

export const paramDef = myAppsParamDef;
