/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { hashtagsTrendParamDef } from '@/server/rest/hashtags.js';

export const meta = {
	tags: ['hashtags'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 60 * 1,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				tag: {
					type: 'string',
					optional: false, nullable: false,
				},
				chart: {
					type: 'array',
					optional: false, nullable: false,
					items: {
						type: 'number',
						optional: false, nullable: false,
					},
				},
				usersCount: {
					type: 'number',
					optional: false, nullable: false,
				},
			},
		},
	},
} as const;

export const paramDef = hashtagsTrendParamDef;
