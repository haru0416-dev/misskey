/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { apGetParamDef } from '@/server/rest/ap.js';

export const meta = {
	tags: ['federation'],

	requireAdmin: true,
	requireCredential: true,
	kind: 'read:federation',

	limit: {
		duration: ms('1hour'),
		max: 30,
	},

	errors: {
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
	},
} as const;

export const paramDef = apGetParamDef;
