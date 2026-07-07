/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { registryGetParamDef } from '@/server/rest/registry.js';

export const meta = {
	requireCredential: true,
	kind: 'read:account',

	errors: {
		noSuchKey: {
			message: 'No such key.',
			code: 'NO_SUCH_KEY',
			id: '97a1e8e7-c0f7-47d2-957a-92e61256e01a',
		},
	},

	res: {
		type: 'object',
		properties: {
			updatedAt: {
				type: 'string',
				optional: false,
			},
			value: {
				optional: false,
			},
		},
	},
} as const;

export const paramDef = registryGetParamDef;
