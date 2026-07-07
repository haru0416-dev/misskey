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
			id: 'ac3ed68a-62f0-422b-a7bc-d5e09e8f6a6a',
		},
	},

	res: {
		type: 'object',
	}
} as const;

export const paramDef = registryGetParamDef;
