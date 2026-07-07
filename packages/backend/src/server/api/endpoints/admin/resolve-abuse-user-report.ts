/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminResolveAbuseUserReportParamDef } from '@/server/rest/admin-abuse-reports.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:resolve-abuse-user-report',

	errors: {
		noSuchAbuseReport: {
			message: 'No such abuse report.',
			code: 'NO_SUCH_ABUSE_REPORT',
			id: 'ac3794dd-2ce4-d878-e546-73c60c06b398',
			kind: 'server',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = adminResolveAbuseUserReportParamDef;
