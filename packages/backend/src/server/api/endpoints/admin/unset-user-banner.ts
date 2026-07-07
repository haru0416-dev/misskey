/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminUserMaintenanceParamDef } from '@/server/rest/admin-user-maintenance.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:unset-user-banner',
} as const;

export const paramDef = adminUserMaintenanceParamDef;

// eslint-disable-next-line import/no-default-export
