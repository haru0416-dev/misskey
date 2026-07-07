/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { registryScopeParamDef } from '@/server/rest/registry.js';

export const meta = {
	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		additionalProperties: {
			type: 'string',
		},
	},
} as const;

export const paramDef = registryScopeParamDef;
