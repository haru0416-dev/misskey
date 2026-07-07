/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { driveFoldersUpdateParamDef } from '@/server/rest/drive.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'write:drive',

	errors: {
		noSuchFolder: {
			message: 'No such folder.',
			code: 'NO_SUCH_FOLDER',
			id: 'f7974dac-2c0d-4a27-926e-23583b28e98e',
		},

		noSuchParentFolder: {
			message: 'No such parent folder.',
			code: 'NO_SUCH_PARENT_FOLDER',
			id: 'ce104e3a-faaf-49d5-b459-10ff0cbbcaa1',
		},

		recursiveNesting: {
			message: 'It can not be structured like nesting folders recursively.',
			code: 'RECURSIVE_NESTING',
			id: 'dbeb024837894013aed44279f9199740',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'DriveFolder',
	},
} as const;

export const paramDef = driveFoldersUpdateParamDef;
