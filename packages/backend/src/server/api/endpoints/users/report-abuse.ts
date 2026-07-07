/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { usersReportAbuseParamDef } from '@/server/rest/admin-abuse-reports.js';

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'write:report-abuse',

	description: 'File a report.',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '1acefcb5-0959-43fd-9685-b48305736cb5',
		},

		cannotReportYourself: {
			message: 'Cannot report yourself.',
			code: 'CANNOT_REPORT_YOURSELF',
			id: '1e13149e-b1e8-43cf-902e-c01dbfcb202f',
		},

		cannotReportAdmin: {
			message: 'Cannot report the admin.',
			code: 'CANNOT_REPORT_THE_ADMIN',
			id: '35e166f5-05fb-4f87-a2d5-adb42676d48f',
		},
	},
} as const;

export const paramDef = usersReportAbuseParamDef;
