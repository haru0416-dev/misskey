/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminEmojiImportZipParamDef } from '@/server/rest/emojis.js';

export const meta = {
	secure: true,
	requireCredential: true,
	requiredRolePolicy: 'canManageCustomEmojis',
} as const;

export const paramDef = adminEmojiImportZipParamDef;
