/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { federationStatsParamDef } from '@/server/rest/federation.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,

	allowGet: true,
	cacheSec: 60 * 60,

	res: {
		type: 'object',
		optional: false,
		nullable: false,
		properties: {
			topSubInstances: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'FederationInstance',
				},
			},
			otherFollowersCount: { type: 'number' },
			topPubInstances: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'FederationInstance',
				},
			},
			otherFollowingCount: { type: 'number' },
		},
	},
} as const;

export const paramDef = federationStatsParamDef;
