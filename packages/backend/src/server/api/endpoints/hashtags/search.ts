/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { hashtagsSearchParamDef } from '@/server/rest/hashtags.js';

export const meta = {
	tags: ['hashtags'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'string',
			optional: false, nullable: false,
		},
	},
} as const;

export const paramDef = hashtagsSearchParamDef;
