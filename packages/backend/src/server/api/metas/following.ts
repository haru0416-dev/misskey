/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { followingCreateParamDef, followingListParamDef, followingRequestsListParamDef, followingUpdateAllParamDef, followingUpdateParamDef, followingUserIdParamDef } from '@/server/rest/following.js';
import ms from 'ms';

export const endpointMetas = {
	'following/create': {
		meta: {
			tags: ['following', 'users'],

			limit: {
				duration: ms('1hour'),
				max: 100,
			},

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:following',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5',
				},

				followeeIsYourself: {
					message: 'Followee is yourself.',
					code: 'FOLLOWEE_IS_YOURSELF',
					id: '26fbe7bb-a331-4857-af17-205b426669a9',
				},

				alreadyFollowing: {
					message: 'You are already following that user.',
					code: 'ALREADY_FOLLOWING',
					id: '35387507-38c7-4cb9-9197-300b93783fa0',
				},

				blocking: {
					message: 'You are blocking that user.',
					code: 'BLOCKING',
					id: '4e2206ec-aa4f-4960-b865-6c23ac38e2d9',
				},

				blocked: {
					message: 'You are blocked by that user.',
					code: 'BLOCKED',
					id: 'c4ab57cc-4e41-45e9-bfd9-584f61e35ce0',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'UserLite',
			},
		} as const,
		paramDef: followingCreateParamDef,
	},
	'following/delete': {
		meta: {
			tags: ['following', 'users'],

			limit: {
				duration: ms('1hour'),
				max: 100,
			},

			requireCredential: true,

			kind: 'write:following',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '5b12c78d-2b28-4dca-99d2-f56139b42ff8',
				},

				followeeIsYourself: {
					message: 'Followee is yourself.',
					code: 'FOLLOWEE_IS_YOURSELF',
					id: 'd9e400b9-36b0-4808-b1d8-79e707f1296c',
				},

				notFollowing: {
					message: 'You are not following that user.',
					code: 'NOT_FOLLOWING',
					id: '5dbf82f5-c92b-40b1-87d1-6c8c0741fd09',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'UserLite',
			},
		} as const,
		paramDef: followingUserIdParamDef,
	},
	'following/invalidate': {
		meta: {
			tags: ['following', 'users'],

			limit: {
				duration: ms('1hour'),
				max: 100,
			},

			requireCredential: true,

			kind: 'write:following',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'b77e6ae6-a3e5-40da-9cc8-c240115479cc',
				},

				followerIsYourself: {
					message: 'Follower is yourself.',
					code: 'FOLLOWER_IS_YOURSELF',
					id: '07dc03b9-03da-422d-885b-438313707662',
				},

				notFollowing: {
					message: 'The other use is not following you.',
					code: 'NOT_FOLLOWING',
					id: '918faac3-074f-41ae-9c43-ed5d2946770d',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'UserLite',
			},
		} as const,
		paramDef: followingUserIdParamDef,
	},
	'following/list': {
		meta: {
			tags: ['users'],

			requireCredential: true,
			kind: 'read:following',
			description: 'List of following users',

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
		paramDef: followingListParamDef,
	},
	'following/requests/accept': {
		meta: {
			tags: ['following', 'account'],

			requireCredential: true,

			kind: 'write:following',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '66ce1645-d66c-46bb-8b79-96739af885bd',
				},
				noFollowRequest: {
					message: 'No follow request.',
					code: 'NO_FOLLOW_REQUEST',
					id: 'bcde4f8b-0913-4614-8881-614e522fb041',
				},
			},
		} as const,
		paramDef: followingUserIdParamDef,
	},
	'following/requests/cancel': {
		meta: {
			tags: ['following', 'account'],

			requireCredential: true,

			kind: 'write:following',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '4e68c551-fc4c-4e46-bb41-7d4a37bf9dab',
				},

				followRequestNotFound: {
					message: 'Follow request not found.',
					code: 'FOLLOW_REQUEST_NOT_FOUND',
					id: '089b125b-d338-482a-9a09-e2622ac9f8d4',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'UserLite',
			},
		} as const,
		paramDef: followingUserIdParamDef,
	},
	'following/requests/list': {
		meta: {
			tags: ['following', 'account'],

			requireCredential: true,

			kind: 'read:following',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: {
							type: 'string',
							optional: false, nullable: false,
							format: 'id',
						},
						follower: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'UserLite',
						},
						followee: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'UserLite',
						},
					},
				},
			},
		} as const,
		paramDef: followingRequestsListParamDef,
	},
	'following/requests/reject': {
		meta: {
			tags: ['following', 'account'],

			requireCredential: true,

			kind: 'write:following',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: 'abc2ffa6-25b2-4380-ba99-321ff3a94555',
				},
			},
		} as const,
		paramDef: followingUserIdParamDef,
	},
	'following/requests/sent': {
		meta: {
			tags: ['following', 'account'],

			requireCredential: true,

			kind: 'read:following',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: {
							type: 'string',
							optional: false, nullable: false,
							format: 'id',
						},
						follower: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'UserLite',
						},
						followee: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'UserLite',
						},
					},
				},
			},
		} as const,
		paramDef: followingRequestsListParamDef,
	},
	'following/update': {
		meta: {
			tags: ['following', 'users'],

			limit: {
				duration: ms('1hour'),
				max: 100,
			},

			requireCredential: true,

			kind: 'write:following',

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '14318698-f67e-492a-99da-5353a5ac52be',
				},

				followeeIsYourself: {
					message: 'Followee is yourself.',
					code: 'FOLLOWEE_IS_YOURSELF',
					id: '4c4cbaf9-962a-463b-8418-a5e365dbf2eb',
				},

				notFollowing: {
					message: 'You are not following that user.',
					code: 'NOT_FOLLOWING',
					id: 'b8dc75cf-1cb5-46c9-b14b-5f1ffbd782c9',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'UserLite',
			},
		} as const,
		paramDef: followingUpdateParamDef,
	},
	'following/update-all': {
		meta: {
			tags: ['following', 'users'],

			limit: {
				duration: ms('1hour'),
				max: 10,
			},

			requireCredential: true,

			kind: 'write:following',
		} as const,
		paramDef: followingUpdateAllParamDef,
	},
} as const;
