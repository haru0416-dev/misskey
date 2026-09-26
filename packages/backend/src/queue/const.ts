/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MetricsTime } from 'bullmq';
import type { Config } from '@/config.js';
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
} as const;

export function baseQueueOptions(config: Config, queueName: (typeof QUEUE)[keyof typeof QUEUE]) {
	for (const [name, timeout] of Object.entries({
		connectionTimeout: config.valkey.jobQueue.connectTimeout,
		commandTimeout: config.valkey.jobQueue.commandTimeout,
	})) {
		if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
			throw new Error(`valkey.jobQueue.${name} must be a positive duration within the timer range`);
		}
	}
	if (config.valkey.jobQueue.connectTimeout + config.valkey.jobQueue.commandTimeout > 2_147_483_647) {
		throw new Error('valkey.jobQueue connection and command timeout sum exceeds the timer range');
	}
	return {
		connection: {
			host: config.valkey.jobQueue.host,
			port: config.valkey.jobQueue.port,
			family: config.valkey.jobQueue.family,
			connectTimeout: config.valkey.jobQueue.connectTimeout,
			commandTimeout: config.valkey.jobQueue.commandTimeout,
			// producer の失敗は呼出元へ返し、outbox は永続行から回復する。期限切れ要求は再送しない。
			enableOfflineQueue: false,
			autoResendUnfulfilledCommands: false,
			maxRetriesPerRequest: 0,
			...(config.valkey.jobQueue.username == null ? {} : { username: config.valkey.jobQueue.username }),
			...(config.valkey.jobQueue.password == null ? {} : { password: config.valkey.jobQueue.password }),
			...(config.valkey.jobQueue.db == null ? {} : { db: config.valkey.jobQueue.db }),
			...(config.valkey.jobQueue.tls == null ? {} : { tls: {} }),
		},
		prefix: config.valkey.jobQueue.prefix
			? `${config.valkey.jobQueue.prefix}:queue:${queueName}`
			: `queue:${queueName}`,
	};
}

function baseBlockingQueueOptions(config: Config, queueName: (typeof QUEUE)[keyof typeof QUEUE]) {
	const queueOptions = baseQueueOptions(config, queueName);
	const { commandTimeout: _commandTimeout, ...connection } = queueOptions.connection;

	return {
		...queueOptions,
		connection: {
			...connection,
			maxRetriesPerRequest: null,
			enableOfflineQueue: true,
			autoResendUnfulfilledCommands: true,
		},
	};
}

export function baseWorkerOptions(config: Config, queueName: (typeof QUEUE)[keyof typeof QUEUE]): Bull.WorkerOptions {
	return {
		...baseBlockingQueueOptions(config, queueName),
		metrics: {
			maxDataPoints: MetricsTime.ONE_WEEK,
		},
	};
}

export function baseQueueEventsOptions(
	config: Config,
	queueName: (typeof QUEUE)[keyof typeof QUEUE],
): Bull.QueueEventsOptions {
	return baseBlockingQueueOptions(config, queueName);
}

export function queueRetentionOptions(
	config: Pick<Config, 'queues'>,
): Pick<Bull.JobsOptions, 'removeOnComplete' | 'removeOnFail'> {
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
