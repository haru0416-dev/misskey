/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAccountDeleteParamDef } from '@/server/rest/admin-accounts.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:delete-account',
} as const;

export const paramDef = adminAccountDeleteParamDef;
