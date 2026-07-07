/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { antennasRemoveNoteParamDef } from '@/server/rest/antennas.js';

export const meta = {
	tags: ['antennas', 'account', 'notes'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:account',

	errors: {
		noSuchAntenna: {
			message: 'No such antenna.',
			code: 'NO_SUCH_ANTENNA',
			id: '850926e0-fd3b-49b6-b69a-b28a5dbd82fe',
		},
	},
} as const;

export const paramDef = antennasRemoveNoteParamDef;
