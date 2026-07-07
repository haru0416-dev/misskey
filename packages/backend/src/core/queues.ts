/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import type { Config } from '@/config.js';
import { baseQueueOptions, QUEUE } from '@/queue/const.js';
import {
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
export type InboxQueue = Bull.Queue<InboxJobData>;
export type DbQueue = Bull.Queue;
export type RelationshipQueue = Bull.Queue<RelationshipJobData>;
export type ObjectStorageQueue = Bull.Queue;
export type UserWebhookDeliverQueue = Bull.Queue<UserWebhookDeliverJobData>;
export type SystemWebhookDeliverQueue = Bull.Queue<SystemWebhookDeliverJobData>;

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
	return new Bull.Queue(QUEUE.DB, baseQueueOptions(config, QUEUE.DB));
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
