/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminUpdateUserNoteParamDef } from '@/server/rest/admin-user-maintenance.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:user-note',
} as const;

export const paramDef = adminUpdateUserNoteParamDef;
