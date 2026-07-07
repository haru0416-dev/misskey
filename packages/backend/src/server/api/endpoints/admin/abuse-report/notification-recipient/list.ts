/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAbuseReportNotificationRecipientListParamDef } from '@/server/rest/admin-abuse-report-notification-recipient.js';

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

export const paramDef = adminAbuseReportNotificationRecipientListParamDef;
