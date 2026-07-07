/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { federationHostFollowingParamDef } from '@/server/rest/federation.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Following',
		},
	},
} as const;

export const paramDef = federationHostFollowingParamDef;
