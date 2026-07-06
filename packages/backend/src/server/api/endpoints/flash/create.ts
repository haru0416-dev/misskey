/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { flashCreateParamDef } from '@/server/rest/flash.js';

export const meta = {
	tags: ['flash'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:flash',

	limit: {
		duration: ms('1hour'),
		max: 10,
	},

	errors: {
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Flash',
	},
} as const;

export const paramDef = flashCreateParamDef;
