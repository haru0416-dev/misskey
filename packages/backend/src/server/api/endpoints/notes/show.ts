/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { notesShowParamDef } from '@/server/rest/notes.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Note',
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '24fcbfc6-2e37-42b6-8388-c29b3861a08d',
		},

		contentRestrictedByUser: {
			message: 'Content restricted by user. Please sign in to view.',
			code: 'CONTENT_RESTRICTED_BY_USER',
			id: 'fbcc002d-37d9-4944-a6b0-d9e29f2d33ab',
		},

		contentRestrictedByServer: {
			message: 'Content restricted by server settings. Please sign in to view.',
			code: 'CONTENT_RESTRICTED_BY_SERVER',
			id: '145f88d2-b03d-4087-8143-a78928883c4b',
		},
	},
} as const;

export const paramDef = notesShowParamDef;
