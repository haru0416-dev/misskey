/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { emptyParamDef } from '@/server/rest/clips.js';

export const meta = {
	tags: ['account', 'clip'],

	requireCredential: true,

	kind: 'read:clip-favorite',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Clip',
		},
	},
} as const;

export const paramDef = emptyParamDef;
