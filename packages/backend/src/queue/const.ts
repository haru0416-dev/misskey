/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MetricsTime } from 'bullmq';
import { Config } from '@/config.js';
import type * as Bull from 'bullmq';

export const QUEUE = {
	DELIVER: 'deliver',
	INBOX: 'inbox',
	SYSTEM: 'system',
	ENDED_POLL_NOTIFICATION: 'endedPollNotification',
	POST_SCHEDULED_NOTE: 'postScheduledNote',
	DB: 'db',
	RELATIONSHIP: 'relationship',
	OBJECT_STORAGE: 'objectStorage',
	USER_WEBHOOK_DELIVER: 'userWebhookDeliver',
	SYSTEM_WEBHOOK_DELIVER: 'systemWebhookDeliver',
};

export function baseQueueOptions(config: Config, queueName: typeof QUEUE[keyof typeof QUEUE]): Bull.QueueOptions {
	return {
		connection: {
			host: config.valkey.jobQueue.host,
			port: config.valkey.jobQueue.port,
			family: config.valkey.jobQueue.family,
			connectTimeout: config.valkey.jobQueue.connectTimeout,
			commandTimeout: config.valkey.jobQueue.commandTimeout,
			...(config.valkey.jobQueue.username == null ? {} : { username: config.valkey.jobQueue.username }),
			...(config.valkey.jobQueue.password == null ? {} : { password: config.valkey.jobQueue.password }),
			...(config.valkey.jobQueue.db == null ? {} : { db: config.valkey.jobQueue.db }),
			...(config.valkey.jobQueue.tls == null ? {} : { tls: {} }),
		},
		prefix: config.valkey.jobQueue.prefix ? `${config.valkey.jobQueue.prefix}:queue:${queueName}` : `queue:${queueName}`,
	};
}

export function baseWorkerOptions(config: Config, queueName: typeof QUEUE[keyof typeof QUEUE]): Bull.WorkerOptions {
	return {
		...baseQueueOptions(config, queueName),
		metrics: {
			maxDataPoints: MetricsTime.ONE_WEEK,
		},
	};
}

export function queueRetentionOptions(config: Pick<Config, 'queues'>): Pick<Bull.JobsOptions, 'removeOnComplete' | 'removeOnFail'> {
	return {
		removeOnComplete: {
			age: config.queues.retention.completedMaximumAgeSeconds,
			count: config.queues.retention.completedMaximumCount,
		},
		removeOnFail: {
			age: config.queues.retention.failedMaximumAgeSeconds,
			count: config.queues.retention.failedMaximumCount,
		},
	};
}
