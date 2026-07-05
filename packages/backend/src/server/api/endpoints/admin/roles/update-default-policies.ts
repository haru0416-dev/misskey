/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['admin', 'role'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:roles',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		policies: {
			type: 'object',
		},
	},
	required: [
		'policies',
	],
} as const;
