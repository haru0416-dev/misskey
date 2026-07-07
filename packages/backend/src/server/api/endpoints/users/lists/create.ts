/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createParamDef } from '@/server/rest/users-lists.js';

export const meta = {
	tags: ['lists'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',

	description: 'Create a new list of users.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'UserList',
	},

	errors: {
		tooManyUserLists: {
			message: 'You cannot create user list any more.',
			code: 'TOO_MANY_USERLISTS',
			id: '0cf21a28-7715-4f39-a20d-777bfdb8d138',
		},
	},
} as const;

export const paramDef = createParamDef;
