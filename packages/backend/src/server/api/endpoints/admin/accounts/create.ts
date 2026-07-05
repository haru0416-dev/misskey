/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { localUsernameSchema, passwordSchema } from '@/models/User.js';

export const meta = {
	tags: ['admin'],

	errors: {
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '1fb7cb09-d46a-4fff-b8df-057708cce513',
		},

		wrongInitialPassword: {
			message: 'Initial password is incorrect.',
			code: 'INCORRECT_INITIAL_PASSWORD',
			id: '97147c55-1ae1-4f6f-91d6-e1c3e0e76d62',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		allOf: [
			{
				type: 'object',
				ref: 'MeDetailed',
			},
			{
				type: 'object',
				optional: false, nullable: false,
				properties: {
					token: {
						type: 'string',
						optional: false, nullable: false,
					},
				},
			}
		],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		username: localUsernameSchema,
		password: passwordSchema,
		setupPassword: { type: 'string', nullable: true },
	},
	required: ['username', 'password'],
} as const;
