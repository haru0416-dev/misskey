/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import type { Config } from '@/config.js';
import { baseQueueOptions, QUEUE } from '@/queue/const.js';
import type {
	DbJobData,
	DbJobMap,
	DbJobName,
	DeliverJobData,
	EndedPollNotificationJobData,
	InboxJobData,
	RelationshipJobData,
	UserWebhookDeliverJobData,
	SystemWebhookDeliverJobData,
	PostScheduledNoteJobData,
} from '../queue/types.js';

export type SystemQueue = Bull.Queue<Record<string, unknown>>;
export type EndedPollNotificationQueue = Bull.Queue<EndedPollNotificationJobData>;
export type PostScheduledNoteQueue = Bull.Queue<PostScheduledNoteJobData>;
export type DeliverQueue = Bull.Queue<DeliverJobData>;
export type DeliverJobInput = {
	name: string;
	data: DeliverJobData;
	opts?: Bull.JobsOptions;
};
export type DeliverJobBulkInput = {
	name: string;
	data: DeliverJobData;
	opts?: Bull.BulkJobOptions;
};
export type InboxQueue = Bull.Queue<InboxJobData>;
type RawDbQueue = Bull.Queue<DbJobData<DbJobName>, unknown, DbJobName>;
export type DbQueue = Omit<RawDbQueue, 'add' | 'addBulk'>;
export type DbJobInput<K extends DbJobName = DbJobName> = {
	[Name in K]: {
		name: Name;
		data: DbJobMap[Name];
		opts?: Bull.JobsOptions;
	};
}[K];
export type DbJobBulkInput<K extends DbJobName = DbJobName> = {
	[Name in K]: {
		name: Name;
		data: DbJobMap[Name];
		opts?: Bull.BulkJobOptions;
	};
}[K];
export type RelationshipQueue = Bull.Queue<RelationshipJobData>;
export type ObjectStorageQueue = Bull.Queue;
export type UserWebhookDeliverQueue = Bull.Queue<UserWebhookDeliverJobData>;
export type SystemWebhookDeliverQueue = Bull.Queue<SystemWebhookDeliverJobData>;

export async function addDbJob(queue: DbQueue, job: DbJobInput): Promise<void> {
	await (queue as RawDbQueue).add(job.name, job.data, job.opts);
}

export async function addDbJobs<K extends DbJobName>(queue: DbQueue, jobs: DbJobBulkInput<K>[]): Promise<void> {
	await (queue as RawDbQueue).addBulk(jobs);
}

export async function addDeliverJob(queue: DeliverQueue, job: DeliverJobInput): Promise<void> {
	await queue.add(job.name, job.data, job.opts);
}

export async function addDeliverJobs(queue: DeliverQueue, jobs: DeliverJobBulkInput[]): Promise<void> {
	await queue.addBulk(jobs);
}

export function createSystemQueue(config: Config): SystemQueue {
	return new Bull.Queue(QUEUE.SYSTEM, baseQueueOptions(config, QUEUE.SYSTEM));
}

export function createEndedPollNotificationQueue(config: Config): EndedPollNotificationQueue {
	return new Bull.Queue(QUEUE.ENDED_POLL_NOTIFICATION, baseQueueOptions(config, QUEUE.ENDED_POLL_NOTIFICATION));
}

export function createPostScheduledNoteQueue(config: Config): PostScheduledNoteQueue {
	return new Bull.Queue(QUEUE.POST_SCHEDULED_NOTE, baseQueueOptions(config, QUEUE.POST_SCHEDULED_NOTE));
}

export function createDeliverQueue(config: Config): DeliverQueue {
	return new Bull.Queue(QUEUE.DELIVER, baseQueueOptions(config, QUEUE.DELIVER));
}

export function createInboxQueue(config: Config): InboxQueue {
	return new Bull.Queue(QUEUE.INBOX, baseQueueOptions(config, QUEUE.INBOX));
}

export function createDbQueue(config: Config): DbQueue {
	return new Bull.Queue<DbJobData<DbJobName>, unknown, DbJobName>(QUEUE.DB, baseQueueOptions(config, QUEUE.DB));
}

export function createRelationshipQueue(config: Config): RelationshipQueue {
	return new Bull.Queue(QUEUE.RELATIONSHIP, baseQueueOptions(config, QUEUE.RELATIONSHIP));
}

export function createObjectStorageQueue(config: Config): ObjectStorageQueue {
	return new Bull.Queue(QUEUE.OBJECT_STORAGE, baseQueueOptions(config, QUEUE.OBJECT_STORAGE));
}

export function createUserWebhookDeliverQueue(config: Config): UserWebhookDeliverQueue {
	return new Bull.Queue(QUEUE.USER_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.USER_WEBHOOK_DELIVER));
}

export function createSystemWebhookDeliverQueue(config: Config): SystemWebhookDeliverQueue {
	return new Bull.Queue(QUEUE.SYSTEM_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.SYSTEM_WEBHOOK_DELIVER));
}
