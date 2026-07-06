/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { claimAchievementParamDef } from '@/server/rest/notification.js';

export const meta = {
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:account',
} as const;

export const paramDef = claimAchievementParamDef;
