/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['admin', 'role'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:roles',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Role',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [
	],
} as const;
