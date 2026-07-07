/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { emptyParamDef } from '@/server/rest/invite.js';

export const meta = {
	tags: ['meta'],

	requireCredential: true,
	requiredRolePolicy: 'canInvite',
	kind: 'read:invite-codes',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			remaining: {
				type: 'integer',
				optional: false, nullable: true,
			},
		},
	},
} as const;

export const paramDef = emptyParamDef;
