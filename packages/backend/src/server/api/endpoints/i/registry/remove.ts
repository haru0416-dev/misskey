/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { registryGetParamDef } from '@/server/rest/registry.js';

export const meta = {
	requireCredential: true,
	kind: 'write:account',

	errors: {
		noSuchKey: {
			message: 'No such key.',
			code: 'NO_SUCH_KEY',
			id: '1fac4e8a-a6cd-4e39-a4a5-3a7e11f1b019',
		},
	},
} as const;

export const paramDef = registryGetParamDef;
