/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['admin', 'role', 'users'],

	requireCredential: false,
	requireModerator: true,
	kind: 'read:admin:roles',

	errors: {
		noSuchRole: {
			message: 'No such role.',
			code: 'NO_SUCH_ROLE',
			id: '224eff5e-2488-4b18-b3e7-f50d94421648',
		},
	},

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				createdAt: { type: 'string', format: 'date-time' },
				user: { ref: 'UserDetailed' },
				expiresAt: { type: 'string', format: 'date-time', nullable: true },
			},
			required: ['id', 'createdAt', 'user'],
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roleId: { type: 'string', format: 'misskey:id' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: ['roleId'],
} as const;
