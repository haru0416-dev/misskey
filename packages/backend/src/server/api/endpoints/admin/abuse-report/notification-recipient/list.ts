/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['admin', 'abuse-report', 'notification-recipient'],

	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'read:admin:abuse-report:notification-recipient',

	res: {
		type: 'array',
		items: {
			type: 'object',
			ref: 'AbuseReportNotificationRecipient',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		method: {
			type: 'array',
			items: {
				type: 'string',
				enum: ['email', 'webhook'],
			},
		},
	},
	required: [],
} as const;
