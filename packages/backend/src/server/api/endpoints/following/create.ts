/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { followingCreateParamDef } from '@/server/rest/following.js';

export const meta = {
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
} as const;

export const paramDef = followingCreateParamDef;
