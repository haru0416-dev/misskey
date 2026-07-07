/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readAnnouncementParamDef } from '@/server/rest/announcements.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
	},
} as const;

export const paramDef = readAnnouncementParamDef;
