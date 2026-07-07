/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminUpdateAbuseUserReportParamDef } from '@/server/rest/admin-abuse-reports.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:resolve-abuse-user-report',

	errors: {
		noSuchAbuseReport: {
			message: 'No such abuse report.',
			code: 'NO_SUCH_ABUSE_REPORT',
			id: '15f51cf5-46d1-4b1d-a618-b35bcbed0662',
			kind: 'server',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = adminUpdateAbuseUserReportParamDef;
