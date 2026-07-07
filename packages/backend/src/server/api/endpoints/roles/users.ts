/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { rolesUsersParamDef } from '@/server/rest/roles.js';

export const meta = {
	tags: ['role', 'users'],

	requireCredential: false,

	errors: {
		noSuchRole: {
			message: 'No such role.',
			code: 'NO_SUCH_ROLE',
			id: '30aaaee3-4792-48dc-ab0d-cf501a575ac5',
		},
	},

	res: {
		type: 'array',
		items: {
			type: 'object',
			nullable: false,
			properties: {
				id: {
					type: 'string',
					format: 'misskey:id',
				},
				user: {
					type: 'object',
					ref: 'UserDetailed',
				},
			},
			required: ['id', 'user'],
		},
	},
} as const;

export const paramDef = rolesUsersParamDef;
