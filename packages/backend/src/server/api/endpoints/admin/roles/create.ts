/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminRolesCreateParamDef } from '@/server/rest/admin-roles.js';

export const meta = {
	tags: ['admin', 'role'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:roles',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Role',
	},
} as const;

export const paramDef = adminRolesCreateParamDef;
