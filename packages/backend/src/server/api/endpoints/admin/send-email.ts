/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:send-email',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		to: { type: 'string' },
		subject: { type: 'string' },
		text: { type: 'string' },
	},
	required: ['to', 'subject', 'text'],
} as const;
