/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { StatusError } from '@/misc/status-error.js';
import { updateWebhookInDatabase } from '@/core/WebhookStore.js';
import { updateSystemWebhookInDatabase } from '@/core/SystemWebhookStore.js';
import type { UserWebhookDeliverJobData, SystemWebhookDeliverJobData } from '@/queue/types.js';

export type HonoQueueWebhookDeliverDependencies = {
	config: Pick<Config, 'host' | 'url'>;
	db: MiDrizzleDatabase;
	httpRequestService: Pick<HttpRequestService, 'send'>;
};

async function deliverWebhookForHonoQueue(
	deps: HonoQueueWebhookDeliverDependencies,
	data: { webhookId: string; to: string; secret: string; userId?: string; eventId: string; createdAt: number; type: string; content: unknown },
	onResult: (status: number) => Promise<void>,
): Promise<string> {
	try {
		const res = await deps.httpRequestService.send(data.to, {
			method: 'POST',
			headers: {
				'User-Agent': 'Misskey-Hooks',
				'X-Misskey-Host': deps.config.host,
				'X-Misskey-Hook-Id': data.webhookId,
				'X-Misskey-Hook-Secret': data.secret,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				server: deps.config.url,
				hookId: data.webhookId,
				...(data.userId != null ? { userId: data.userId } : {}),
				eventId: data.eventId,
				createdAt: data.createdAt,
				type: data.type,
				body: data.content,
			}),
		});

		await onResult(res.status);

		return 'Success';
	} catch (res) {
		await onResult(res instanceof StatusError ? res.statusCode : 1);

		if (res instanceof StatusError) {
			if (!res.isRetryable) {
				throw new Bull.UnrecoverableError(`${res.statusCode} ${res.statusMessage}`);
			}

			throw new Error(`${res.statusCode} ${res.statusMessage}`, { cause: res });
		} else {
			throw res;
		}
	}
}

/** UserWebhookDeliverProcessorService.process 相当。 */
export async function handleHonoQueueUserWebhookDeliver(
	deps: HonoQueueWebhookDeliverDependencies,
	job: Bull.Job<UserWebhookDeliverJobData>,
): Promise<string> {
	return await deliverWebhookForHonoQueue(deps, job.data, async status => {
		await updateWebhookInDatabase(deps.db, job.data.webhookId, {
			latestSentAt: new Date(),
			latestStatus: status,
		});
	});
}

/** SystemWebhookDeliverProcessorService.process 相当。 */
export async function handleHonoQueueSystemWebhookDeliver(
	deps: HonoQueueWebhookDeliverDependencies,
	job: Bull.Job<SystemWebhookDeliverJobData>,
): Promise<string> {
	return await deliverWebhookForHonoQueue(deps, job.data, async status => {
		await updateSystemWebhookInDatabase(deps.db, job.data.webhookId, {
			latestSentAt: new Date(),
			latestStatus: status,
		});
	});
}
