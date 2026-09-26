/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as adminAbuseReportContracts } from '@/server/api/metas/admin-abuse-report.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiAdminAbuseReportNotificationRecipientCreate,
	handleApiAdminAbuseReportNotificationRecipientDelete,
	handleApiAdminAbuseReportNotificationRecipientList,
	handleApiAdminAbuseReportNotificationRecipientShow,
	handleApiAdminAbuseReportNotificationRecipientUpdate,
} from '../admin/admin-abuse-report-notification-recipient.js';

export const adminAbuseReportEndpoints = implementEndpoints<ApiShellDependencies>()(adminAbuseReportContracts, {
	'admin/abuse-report/notification-recipient/create': async ({ deps, input, me }) =>
		await handleApiAdminAbuseReportNotificationRecipientCreate(deps, me, input),
	'admin/abuse-report/notification-recipient/delete': async ({ deps, input, me }) => {
		await handleApiAdminAbuseReportNotificationRecipientDelete(deps, me, input);
	},
	'admin/abuse-report/notification-recipient/list': async ({ deps, input }) =>
		await handleApiAdminAbuseReportNotificationRecipientList(deps, input),
	'admin/abuse-report/notification-recipient/show': async ({ deps, input }) =>
		await handleApiAdminAbuseReportNotificationRecipientShow(deps, input),
	'admin/abuse-report/notification-recipient/update': async ({ deps, input, me }) =>
		await handleApiAdminAbuseReportNotificationRecipientUpdate(deps, me, input),
});
