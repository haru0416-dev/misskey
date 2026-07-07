/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { countNoteDraftsParamDef } from '@/server/rest/note-drafts.js';

export const meta = {
	tags: ['notes', 'drafts'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'read:account',

	res: {
		type: 'number',
		optional: false, nullable: false,
		description: 'The number of drafts',
	},

	errors: {
	},
} as const;

export const paramDef = countNoteDraftsParamDef;
