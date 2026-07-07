/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminQueueJobParamDef } from '@/server/rest/admin-queue.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:queue',

	res: {
		optional: false, nullable: false,
		ref: 'QueueJob',
	},
} as const;

export const paramDef = adminQueueJobParamDef;
