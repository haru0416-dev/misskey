/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAvatarDecorationsDeleteParamDef } from '@/server/rest/admin-avatar-decorations.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageAvatarDecorations',
	kind: 'write:admin:avatar-decorations',
	errors: {
	},
} as const;

export const paramDef = adminAvatarDecorationsDeleteParamDef;
