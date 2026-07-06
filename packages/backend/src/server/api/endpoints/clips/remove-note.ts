/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { clipsNoteParamDef } from '@/server/rest/clips.js';

export const meta = {
	tags: ['account', 'notes', 'clips'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',

	errors: {
		noSuchClip: {
			message: 'No such clip.',
			code: 'NO_SUCH_CLIP',
			id: 'b80525c6-97f7-49d7-a42d-ebccd49cfd52',
		},

		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'aff017de-190e-434b-893e-33a9ff5049d8',
		},
	},
} as const;

export const paramDef = clipsNoteParamDef;
