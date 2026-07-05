/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { QUEUE_TYPES, QueueService } from '@/core/QueueService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:queue',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		queue: { type: 'string', enum: QUEUE_TYPES },
		state: { type: 'string', enum: ['*', 'completed', 'wait', 'active', 'paused', 'prioritized', 'delayed', 'failed'] },
	},
	required: ['queue', 'state'],
} as const;
