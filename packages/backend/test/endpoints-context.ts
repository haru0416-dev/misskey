/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { baseQueueOptions, QUEUE } from '@/queue/const.js';
import type {
	DbJobData,
	DeliverJobData,
	InboxJobData,
	ObjectStorageJobData,
	PostScheduledNoteJobData,
	RelationshipJobData,
	SystemWebhookDeliverJobData,
} from '@/queue/types.js';
import { fixtureConfig, openTestDatabase, type TestDatabase } from './fixtures.js';
import { api, signup } from './utils.js';
import type * as misskey from 'misskey-js';

/*
 * endpoints-*.ts が共有する前準備。各 e2e ファイルは setup.e2e.ts で DB ごとリセットされるため、
 * 分割後のファイルはそれぞれ自前で alice 等を作り直す必要がある。同じ内容を各ファイルへ写すと
 * 増えるだけなので、ここに集約する。
 */
export type EndpointsContext = {
	alice: misskey.entities.SignupResponse;
	bob: misskey.entities.SignupResponse;
	carol: misskey.entities.SignupResponse;
	dave: misskey.entities.SignupResponse;
	db: TestDatabase;
	dbQueue: Bull.Queue<DbJobData<'importCustomEmojis' | 'deleteAccount'>> | undefined;
	deliverQueue: Bull.Queue<DeliverJobData> | undefined;
	inboxQueue: Bull.Queue<InboxJobData> | undefined;
	relationshipQueue: Bull.Queue<RelationshipJobData> | undefined;
	objectStorageQueue: Bull.Queue<ObjectStorageJobData> | undefined;
	systemWebhookDeliverQueue: Bull.Queue<SystemWebhookDeliverJobData> | undefined;
	postScheduledNoteQueue: Bull.Queue<PostScheduledNoteJobData> | undefined;
	close: () => Promise<void>;
};

export async function createEndpointsContext(): Promise<EndpointsContext> {
	const config = fixtureConfig;
	const db = openTestDatabase();
	const dbQueue = new Bull.Queue<DbJobData<'importCustomEmojis' | 'deleteAccount'>>(
		QUEUE.DB,
		baseQueueOptions(config, QUEUE.DB),
	);
	const deliverQueue = new Bull.Queue<DeliverJobData>(QUEUE.DELIVER, baseQueueOptions(config, QUEUE.DELIVER));
	const inboxQueue = new Bull.Queue<InboxJobData>(QUEUE.INBOX, baseQueueOptions(config, QUEUE.INBOX));
	const relationshipQueue = new Bull.Queue<RelationshipJobData>(
		QUEUE.RELATIONSHIP,
		baseQueueOptions(config, QUEUE.RELATIONSHIP),
	);
	const objectStorageQueue = new Bull.Queue<ObjectStorageJobData>(
		QUEUE.OBJECT_STORAGE,
		baseQueueOptions(config, QUEUE.OBJECT_STORAGE),
	);
	const systemWebhookDeliverQueue = new Bull.Queue<SystemWebhookDeliverJobData>(
		QUEUE.SYSTEM_WEBHOOK_DELIVER,
		baseQueueOptions(config, QUEUE.SYSTEM_WEBHOOK_DELIVER),
	);
	const postScheduledNoteQueue = new Bull.Queue<PostScheduledNoteJobData>(
		QUEUE.POST_SCHEDULED_NOTE,
		baseQueueOptions(config, QUEUE.POST_SCHEDULED_NOTE),
	);

	const alice = await signup({ username: 'alice' });
	const bob = await signup({ username: 'bob' });
	const carol = await signup({ username: 'carol' });
	const dave = await signup({ username: 'dave' });
	await api('admin/update-meta', { federation: 'all' }, alice);

	return {
		alice,
		bob,
		carol,
		dave,
		db,
		dbQueue,
		deliverQueue,
		inboxQueue,
		relationshipQueue,
		objectStorageQueue,
		systemWebhookDeliverQueue,
		postScheduledNoteQueue,
		close: async () => {
			await dbQueue.close();
			await deliverQueue.close();
			await inboxQueue.close();
			await relationshipQueue.close();
			await objectStorageQueue.close();
			await systemWebhookDeliverQueue.close();
			await postScheduledNoteQueue.close();
			await db.close();
		},
	};
}

/** endpoints-*.ts のテスト本体が使う小さな断言ヘルパー。 */
export function getAt<T>(values: readonly T[], index: number): T {
	const value = values[index];
	if (value == null) throw new Error(`missing element at ${index}`);
	return value;
}

export function getDefined<T>(value: T | undefined): T {
	if (value === undefined) throw new Error('expected a defined value');
	return value;
}
