/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { followingUserIdParamDef } from '@/server/rest/following.js';

export const meta = {
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
} as const;

export const paramDef = followingUserIdParamDef;
