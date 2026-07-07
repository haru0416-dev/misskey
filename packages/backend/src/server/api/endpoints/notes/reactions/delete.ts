/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { reactionsDeleteParamDef } from '@/server/rest/notes-reactions.js';

export const meta = {
	tags: ['reactions', 'notes'],

	requireCredential: true,

	kind: 'write:reactions',

	limit: {
		duration: ms('1hour'),
		max: 60,
		minInterval: ms('3sec'),
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '764d9fce-f9f2-4a0e-92b1-6ceac9a7ad37',
		},

		notReacted: {
			message: 'You are not reacting to that note.',
			code: 'NOT_REACTED',
			id: '92f4426d-4196-4125-aa5b-02943e2ec8fc',
		},
	},
} as const;

export const paramDef = reactionsDeleteParamDef;
