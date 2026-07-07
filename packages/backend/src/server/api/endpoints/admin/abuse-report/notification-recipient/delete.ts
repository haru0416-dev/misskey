/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAbuseReportNotificationRecipientDeleteParamDef } from '@/server/rest/admin-abuse-report-notification-recipient.js';

export const meta = {
	tags: ['admin', 'abuse-report', 'notification-recipient'],

	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'write:admin:abuse-report:notification-recipient',
} as const;

export const paramDef = adminAbuseReportNotificationRecipientDeleteParamDef;
