/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createFromPublicParamDef } from '@/server/rest/users-lists.js';

export const meta = {
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:account',
	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'UserList',
	},

	errors: {
		tooManyUserLists: {
			message: 'You cannot create user list any more.',
			code: 'TOO_MANY_USERLISTS',
			id: 'e9c105b2-c595-47de-97fb-7f7c2c33e92f',
		},
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '9292f798-6175-4f7d-93f4-b6742279667d',
		},
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '13c457db-a8cb-4d88-b70a-211ceeeabb5f',
		},

		alreadyAdded: {
			message: 'That user has already been added to that list.',
			code: 'ALREADY_ADDED',
			id: 'c3ad6fdb-692b-47ee-a455-7bd12c7af615',
		},

		youHaveBeenBlocked: {
			message: 'You cannot push this user because you have been blocked by this user.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			id: 'a2497f2a-2389-439c-8626-5298540530f4',
		},

		tooManyUsers: {
			message: 'You can not push users any more.',
			code: 'TOO_MANY_USERS',
			id: '1845ea77-38d1-426e-8e4e-8b83b24f5bd7',
		},
	},
} as const;

export const paramDef = createFromPublicParamDef;
