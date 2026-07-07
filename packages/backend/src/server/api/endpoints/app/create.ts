/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { appCreateParamDef } from '@/server/rest/app.js';

export const meta = {
	tags: ['app'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'App',
	},
} as const;

export const paramDef = appCreateParamDef;
