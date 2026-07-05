/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:resolve-abuse-user-report',

	errors: {
		noSuchAbuseReport: {
			message: 'No such abuse report.',
			code: 'NO_SUCH_ABUSE_REPORT',
			id: '8763e21b-d9bc-40be-acf6-54c1a6986493',
			kind: 'server',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'misskey:id' },
	},
	required: ['reportId'],
} as const;
