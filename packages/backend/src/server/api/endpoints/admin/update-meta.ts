/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminUpdateMetaParamDef, buildAdminUpdateMetaPatch } from '@/server/rest/AdminUpdateMetaLogic.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',
} as const;

export const paramDef = adminUpdateMetaParamDef;
