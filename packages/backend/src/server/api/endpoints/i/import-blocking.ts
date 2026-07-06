/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { importBlockingParamDef } from '@/server/rest/import-jobs.js';

export const meta = {
	secure: true,
	requireCredential: true,
	requiredRolePolicy: 'canImportBlocking',
	prohibitMoved: true,

	limit: {
		duration: ms('1hour'),
		max: 1,
	},

	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'ebb53e5f-6574-9c0c-0b92-7ca6def56d7e',
		},

		unexpectedFileType: {
			message: 'We need csv file.',
			code: 'UNEXPECTED_FILE_TYPE',
			id: 'b6fab7d6-d945-d67c-dfdb-32da1cd12cfe',
		},

		tooBigFile: {
			message: 'That file is too big.',
			code: 'TOO_BIG_FILE',
			id: 'b7fbf0b1-aeef-3b21-29ef-fadd4cb72ccf',
		},

		emptyFile: {
			message: 'That file is empty.',
			code: 'EMPTY_FILE',
			id: '6f3a4dcc-f060-a707-4950-806fbdbe60d6',
		},
	},
} as const;

export const paramDef = importBlockingParamDef;
