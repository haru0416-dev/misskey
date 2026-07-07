/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { federationInstancesParamDef } from '@/server/rest/federation.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 3600,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'FederationInstance',
		},
	},
} as const;

export const paramDef = federationInstancesParamDef;
