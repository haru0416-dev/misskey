/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HOUR } from '@/const.js';
import { federationUpdateRemoteUserParamDef } from '@/server/rest/activitypub/ap-person.js';
import {
	federationHostFollowingParamDef,
	federationInstancesParamDef,
	federationShowInstanceParamDef,
	federationStatsParamDef,
	federationUsersParamDef,
} from '@/server/rest/activitypub/federation.js';
import { defineContract } from '@/server/rest/endpoint-contract.js';

export const endpointMetas = {
	'federation/followers': defineContract({
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
		},
		paramDef: federationHostFollowingParamDef,
	}),
	'federation/following': defineContract({
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
		},
		paramDef: federationHostFollowingParamDef,
	}),
	'federation/instances': defineContract({
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
		},
		paramDef: federationInstancesParamDef,
	}),
	'federation/show-instance': defineContract({
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
		},
		paramDef: federationShowInstanceParamDef,
	}),
	'federation/stats': defineContract({
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
		},
		paramDef: federationStatsParamDef,
	}),
	'federation/update-remote-user': defineContract({
		meta: {
			tags: ['federation'],

			// 呼ぶたびにリモートへの取得が走るので、匿名では呼ばせず回数も絞る。
			requireCredential: true,
			kind: 'read:account',

			limit: {
				duration: HOUR,
				max: 30,
			},

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
		},
		paramDef: federationUpdateRemoteUserParamDef,
	}),
	'federation/users': defineContract({
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
		},
		paramDef: federationUsersParamDef,
	}),
};
