/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import type { SystemWebhookDeliverQueue } from '@/core/queues.js';
import type { SystemWebhookPayload } from '@/core/system-webhook-types.js';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { SystemWebhookDeliverJobData } from '@/queue/types.js';

export function enqueueSystemWebhookDeliverJob<T extends SystemWebhookEventType>(
	queue: SystemWebhookDeliverQueue,
	webhook: MiSystemWebhook,
	type: T,
	content: SystemWebhookPayload<T>,
	opts?: { attempts?: number },
) {
	const data: SystemWebhookDeliverJobData<T> = {
		type,
		content,
		webhookId: webhook.id,
		to: webhook.url,
		secret: webhook.secret,
		createdAt: Date.now(),
		eventId: randomUUID(),
	};

	return queue.add(webhook.id, data, {
		attempts: opts?.attempts ?? 4,
		backoff: {
			type: 'custom',
		},
		removeOnComplete: {
			age: 3600 * 24 * 7, // keep up to 7 days
			count: 30,
		},
		removeOnFail: {
			age: 3600 * 24 * 7, // keep up to 7 days
			count: 100,
		},
	});
}
