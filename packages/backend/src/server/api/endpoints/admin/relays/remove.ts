/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminRelaysWriteParamDef } from '@/server/rest/admin-relays.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:relays',
} as const;

export const paramDef = adminRelaysWriteParamDef;
