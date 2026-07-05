/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { QUEUE_TYPES, QueueService } from '@/core/QueueService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:queue',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			optional: false, nullable: false,
			ref: 'QueueJob',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		queue: { type: 'string', enum: QUEUE_TYPES },
		state: { type: 'array', items: { type: 'string', enum: ['active', 'wait', 'delayed', 'completed', 'failed', 'paused'] } },
		search: { type: 'string' },
	},
	required: ['queue', 'state'],
} as const;
