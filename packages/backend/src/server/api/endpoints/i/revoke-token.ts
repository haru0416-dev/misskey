/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { iRevokeTokenParamDef } from '@/server/rest/app.js';

export const meta = {
	requireCredential: true,

	secure: true,
} as const;

export const paramDef = iRevokeTokenParamDef;
