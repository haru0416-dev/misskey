/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	adminAbuseReportNotificationRecipientCreateParamDef,
	adminAbuseReportNotificationRecipientDeleteParamDef,
	adminAbuseReportNotificationRecipientListParamDef,
	adminAbuseReportNotificationRecipientShowParamDef,
	adminAbuseReportNotificationRecipientUpdateParamDef,
} from '@/server/rest/admin/admin-abuse-report-notification-recipient.js';

export const endpointMetas = {
	'admin/abuse-report/notification-recipient/create': {
		meta: {
			tags: ['admin', 'abuse-report', 'notification-recipient'],

			requireCredential: true,
			requireModerator: true,
			secure: true,
			kind: 'write:admin:abuse-report:notification-recipient',

			res: {
				type: 'object',
				ref: 'AbuseReportNotificationRecipient',
			},

			errors: {
				correlationCheckEmail: {
					message: 'If "method" is email, "userId" must be set.',
					code: 'CORRELATION_CHECK_EMAIL',
					id: '348bb8ae-575a-6fe9-4327-5811999def8f',
					httpStatusCode: 400,
				},
				correlationCheckWebhook: {
					message: 'If "method" is webhook, "systemWebhookId" must be set.',
					code: 'CORRELATION_CHECK_WEBHOOK',
					id: 'b0c15051-de2d-29ef-260c-9585cddd701a',
					httpStatusCode: 400,
				},
				emailAddressNotSet: {
					message: 'Email address is not set.',
					code: 'EMAIL_ADDRESS_NOT_SET',
					id: '7cc1d85e-2f58-fc31-b644-3de8d0d3421f',
					httpStatusCode: 400,
				},
			},
		} as const,
		paramDef: adminAbuseReportNotificationRecipientCreateParamDef,
	},
	'admin/abuse-report/notification-recipient/delete': {
		meta: {
			tags: ['admin', 'abuse-report', 'notification-recipient'],

			requireCredential: true,
			requireModerator: true,
			secure: true,
			kind: 'write:admin:abuse-report:notification-recipient',
		} as const,
		paramDef: adminAbuseReportNotificationRecipientDeleteParamDef,
	},
	'admin/abuse-report/notification-recipient/list': {
		meta: {
			allowQuery: true,
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
		} as const,
		paramDef: adminAbuseReportNotificationRecipientListParamDef,
	},
	'admin/abuse-report/notification-recipient/show': {
		meta: {
			allowQuery: true,
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
		} as const,
		paramDef: adminAbuseReportNotificationRecipientShowParamDef,
	},
	'admin/abuse-report/notification-recipient/update': {
		meta: {
			tags: ['admin', 'abuse-report', 'notification-recipient'],

			requireCredential: true,
			requireModerator: true,
			secure: true,
			kind: 'write:admin:abuse-report:notification-recipient',

			res: {
				type: 'object',
				ref: 'AbuseReportNotificationRecipient',
			},

			errors: {
				correlationCheckEmail: {
					message: 'If "method" is email, "userId" must be set.',
					code: 'CORRELATION_CHECK_EMAIL',
					id: '348bb8ae-575a-6fe9-4327-5811999def8f',
					httpStatusCode: 400,
				},
				correlationCheckWebhook: {
					message: 'If "method" is webhook, "systemWebhookId" must be set.',
					code: 'CORRELATION_CHECK_WEBHOOK',
					id: 'b0c15051-de2d-29ef-260c-9585cddd701a',
					httpStatusCode: 400,
				},
				emailAddressNotSet: {
					message: 'Email address is not set.',
					code: 'EMAIL_ADDRESS_NOT_SET',
					id: '7cc1d85e-2f58-fc31-b644-3de8d0d3421f',
					httpStatusCode: 400,
				},
			},
		} as const,
		paramDef: adminAbuseReportNotificationRecipientUpdateParamDef,
	},
} as const;
