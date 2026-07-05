/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'write:drive',

	limit: {
		duration: ms('1hour'),
		max: 10,
	},

	errors: {
		noSuchFolder: {
			message: 'No such folder.',
			code: 'NO_SUCH_FOLDER',
			id: '53326628-a00d-40a6-a3cd-8975105c0f95',
		},
	},

	res: {
		type: 'object' as const,
		optional: false as const, nullable: false as const,
		ref: 'DriveFolder',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', default: 'Untitled', maxLength: 200 },
		parentId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;
