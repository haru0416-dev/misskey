/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { federationUpdateRemoteUserParamDef } from '@/server/rest/ap-person.js';
import {
	federationHostFollowingParamDef,
	federationInstancesParamDef,
	federationShowInstanceParamDef,
	federationStatsParamDef,
	federationUsersParamDef,
} from '@/server/rest/federation.js';

export const endpointMetas = {
	'federation/followers': {
		meta: {
			allowQuery: true,
			tags: ['federation'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Following',
				},
			},
		} as const,
		paramDef: federationHostFollowingParamDef,
	},
	'federation/following': {
		meta: {
			allowQuery: true,
			tags: ['federation'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Following',
				},
			},
		} as const,
		paramDef: federationHostFollowingParamDef,
	},
	'federation/instances': {
		meta: {
			allowQuery: true,
			tags: ['federation'],

			requireCredential: false,
			allowGet: true,
			cacheSec: 3600,

			res: {
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
		} as const,
		paramDef: federationInstancesParamDef,
	},
	'federation/show-instance': {
		meta: {
			allowQuery: true,
			tags: ['federation'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: true,
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

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '15348ddd-432d-49c2-8a5a-8069753becff',
				},

				notRemoteUser: {
					message: 'User is not a remote user.',
					code: 'NOT_REMOTE_USER',
					id: 'e3ad347a-2493-4f8f-bac0-f91c88daa754',
				},
			},
		} as const,
		paramDef: federationUpdateRemoteUserParamDef,
	},
	'federation/users': {
		meta: {
			allowQuery: true,
			tags: ['federation'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'UserDetailedNotMe',
				},
			},
		} as const,
		paramDef: federationUsersParamDef,
	},
} as const;
