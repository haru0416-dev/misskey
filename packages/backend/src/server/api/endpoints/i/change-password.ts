/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { changePasswordParamDef } from '@/server/rest/account-security.js';

export const meta = {
	requireCredential: true,

	secure: true,
} as const;

export const paramDef = changePasswordParamDef;
