/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'write:drive',

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 100, items: { type: 'string', format: 'misskey:id' } },
		folderId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['fileIds'],
} as const;
