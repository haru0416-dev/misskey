/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { noteIdOnlyParamDef } from '@/server/rest/notes.js';

export const meta = {
	tags: ['notes', 'favorites'],

	requireCredential: true,
	prohibitMoved: true,

	kind: 'write:favorites',

	limit: {
		duration: ms('1hour'),
		max: 20,
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '6dd26674-e060-4816-909a-45ba3f4da458',
		},

		alreadyFavorited: {
			message: 'The note has already been marked as a favorite.',
			code: 'ALREADY_FAVORITED',
			id: 'a402c12b-34dd-41d2-97d8-4d2ffd96a1a6',
		},
	},
} as const;

export const paramDef = noteIdOnlyParamDef;
