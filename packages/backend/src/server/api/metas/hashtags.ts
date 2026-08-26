/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	hashtagsListParamDef,
	hashtagsSearchParamDef,
	hashtagsShowParamDef,
	hashtagsTrendParamDef,
	hashtagsUsersParamDef,
} from '@/server/rest/hashtag/hashtags.js';

export const endpointMetas = {
	'hashtags/list': {
		meta: {
			allowQuery: true,
			tags: ['hashtags'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Hashtag',
				},
			},
		} as const,
		paramDef: hashtagsListParamDef,
	},
	'hashtags/search': {
		meta: {
			allowQuery: true,
			tags: ['hashtags'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'string',
					optional: false,
					nullable: false,
				},
			},
		} as const,
		paramDef: hashtagsSearchParamDef,
	},
	'hashtags/show': {
		meta: {
			allowQuery: true,
			tags: ['hashtags'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Hashtag',
			},

			errors: {
				noSuchHashtag: {
					message: 'No such hashtag.',
					code: 'NO_SUCH_HASHTAG',
					id: '110ee688-193e-4a3a-9ecf-c167b2e6981e',
				},
			},
		} as const,
		paramDef: hashtagsShowParamDef,
	},
	'hashtags/trend': {
		meta: {
			allowQuery: true,
			tags: ['hashtags'],

			requireCredential: false,
			allowGet: true,
			cacheSec: 60 * 1,

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					properties: {
						tag: {
							type: 'string',
							optional: false,
							nullable: false,
						},
						chart: {
							type: 'array',
							optional: false,
							nullable: false,
							items: {
								type: 'number',
								optional: false,
								nullable: false,
							},
						},
						usersCount: {
							type: 'number',
							optional: false,
							nullable: false,
						},
					},
				},
			},
		} as const,
		paramDef: hashtagsTrendParamDef,
	},
	'hashtags/users': {
		meta: {
			allowQuery: true,
			requireCredential: false,

			tags: ['hashtags', 'users'],

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'UserDetailed',
				},
			},
		} as const,
		paramDef: hashtagsUsersParamDef,
	},
} as const;
