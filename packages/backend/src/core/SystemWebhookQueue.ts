/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import type { SystemWebhookDeliverQueue } from '@/core/queues.js';
import type { SystemWebhookPayload } from '@/core/system-webhook-types.js';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { SystemWebhookDeliverJobData } from '@/queue/types.js';
import type { Config } from '@/config.js';
import { queueRetentionOptions } from '@/queue/const.js';

export function enqueueSystemWebhookDeliverJob<T extends SystemWebhookEventType>(
	queue: SystemWebhookDeliverQueue,
	config: Pick<Config, 'queues'>,
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
		...queueRetentionOptions(config),
	});
}
