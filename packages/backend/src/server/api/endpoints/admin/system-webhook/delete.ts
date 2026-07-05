/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['admin', 'system-webhook'],

	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'write:admin:system-webhook',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			format: 'misskey:id',
		},
	},
	required: [
		'id',
	],
} as const;
