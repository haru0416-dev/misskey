/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { testParamDef } from '@/server/rest/meta.js';

export const meta = {
	tags: ['non-productive'],

	description: 'Endpoint for testing input validation.',

	requireCredential: false,

	res: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				format: 'misskey:id',
				optional: true, nullable: false,
			},
			required: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			string: {
				type: 'string',
				optional: true, nullable: false,
			},
			default: {
				type: 'string',
				optional: true, nullable: false,
			},
			nullableDefault: {
				type: 'string',
				default: 'hello',
				optional: true, nullable: true,
			},
		},
	},
} as const;

export const paramDef = testParamDef;
