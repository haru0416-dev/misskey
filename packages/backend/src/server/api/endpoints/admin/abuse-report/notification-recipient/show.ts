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
		type: 'object',
		ref: 'AbuseReportNotificationRecipient',
	},

	errors: {
		noSuchRecipient: {
			message: 'No such recipient.',
			code: 'NO_SUCH_RECIPIENT',
			id: '013de6a8-f757-04cb-4d73-cc2a7e3368e4',
			kind: 'server',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			format: 'misskey:id',
		},
	},
	required: ['id'],
} as const;
