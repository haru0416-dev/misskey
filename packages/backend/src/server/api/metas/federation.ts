/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { federationUpdateRemoteUserParamDef } from '@/server/rest/ap-person.js';
import { federationHostFollowingParamDef, federationInstancesParamDef, federationShowInstanceParamDef, federationStatsParamDef, federationUsersParamDef } from '@/server/rest/federation.js';

export const endpointMetas = {
	'federation/followers': {
		meta: {
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
		} as const,
		paramDef: federationHostFollowingParamDef,
	},
	'federation/following': {
		meta: {
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
		} as const,
		paramDef: federationHostFollowingParamDef,
	},
	'federation/instances': {
		meta: {
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
		} as const,
		paramDef: federationInstancesParamDef,
	},
	'federation/show-instance': {
		meta: {
			tags: ['federation'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false, nullable: true,
				ref: 'FederationInstance',
			},
		} as const,
		paramDef: federationShowInstanceParamDef,
	},
	'federation/stats': {
		meta: {
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
		} as const,
		paramDef: federationStatsParamDef,
	},
	'federation/update-remote-user': {
		meta: {
			tags: ['federation'],

			requireCredential: false,
		} as const,
		paramDef: federationUpdateRemoteUserParamDef,
	},
	'federation/users': {
		meta: {
			tags: ['federation'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'UserDetailedNotMe',
				},
			},
		} as const,
		paramDef: federationUsersParamDef,
	},
} as const;
