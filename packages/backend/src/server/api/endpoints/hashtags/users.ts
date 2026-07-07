/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { hashtagsUsersParamDef } from '@/server/rest/hashtags.js';

export const meta = {
	requireCredential: false,

	tags: ['hashtags', 'users'],

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserDetailed',
		},
	},
} as const;

export const paramDef = hashtagsUsersParamDef;
