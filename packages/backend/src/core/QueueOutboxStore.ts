/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type * as Bull from 'bullmq';
import type * as Redis from 'ioredis';
import {
	addDbJobs,
	addDeliverJobs,
	type DbJobBulkInput,
	type DbQueue,
	type DeliverJobBulkInput,
	type DeliverJobInput,
	type DeliverQueue,
} from '@/core/queues.js';
import {
	queueOutbox,
	type QueueOutboxDeadLetterReason,
	type QueueOutboxLastError,
	type QueueOutboxRow,
} from '@/db/schema/queue-outbox.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { QUEUE } from '@/queue/const.js';
import type { DbJobMap } from '@/queue/types.js';

const CLAIM_LEASE_MS = 30_000;
const MAX_POLL_INTERVAL_MS = 30_000;
const READY_BATCH_SIZE = 500;
const RECONCILE_BATCH_SIZE = 500;

type OutboxDbJobName = 'deleteAccount' | 'deleteDriveFile' | 'userSuspensionPostEffects' | 'notePostCreate';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type SerializedKeepJobs = Record<string, unknown> & {
	age?: unknown;
	count?: unknown;
	limit?: unknown;
};

type SerializedDeleteAccountData = Record<string, unknown> & {
	user?: unknown;
	soft?: unknown;
	accountDeleteCoordinatorId?: unknown;
};

type SerializedDeleteAccountUser = Record<string, unknown> & {
	id?: unknown;
};

type SerializedDbJobData = Record<string, unknown>;

type SerializedJobOptions = Record<string, unknown> & {
	attempts?: unknown;
	backoff?: unknown;
	removeOnComplete?: unknown;
	removeOnFail?: unknown;
};

type SerializedDeliverData = Record<string, unknown> & {
	user?: unknown;
	content?: unknown;
	digest?: unknown;
	to?: unknown;
	isSharedInbox?: unknown;
};

type SerializedDeliverUser = Record<string, unknown> & {
	id?: unknown;
};

type SerializedDeliverEnvelope = Record<string, unknown> & {
	name?: unknown;
	data?: unknown;
};

const invalidKeepJobs = Symbol('invalidKeepJobs');
type KeepJobsOption = NonNullable<Bull.BulkJobOptions['removeOnComplete']>;

function parseKeepJobs(value: unknown): KeepJobsOption | undefined | typeof invalidKeepJobs {
	if (value === undefined || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : invalidKeepJobs;
	if (!isRecord(value)) return invalidKeepJobs;

	const serialized = value as SerializedKeepJobs;
	const { age, count, limit } = serialized;
	if (age === undefined) {
		return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? { count } : invalidKeepJobs;
	}
	if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) return invalidKeepJobs;
	if (count !== undefined && (typeof count !== 'number' || !Number.isFinite(count) || count < 0))
		return invalidKeepJobs;
	if (limit !== undefined && (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0))
		return invalidKeepJobs;
	return {
		age,
		...(count === undefined ? {} : { count }),
		...(limit === undefined ? {} : { limit }),
	};
}

function parseDbJobData(name: OutboxDbJobName, value: SerializedDbJobData): DbJobMap[OutboxDbJobName] | null {
	switch (name) {
		case 'deleteAccount': {
			const user = value['user'];
			if (!isRecord(user) || typeof (user as SerializedDeleteAccountUser).id !== 'string') return null;
			if (value['soft'] !== undefined && typeof value['soft'] !== 'boolean') return null;
			return value as DbJobMap['deleteAccount'];
		}
		case 'deleteDriveFile': {
			const file = value['file'];
			const replacementKeys = value['replacementKeys'];
			return typeof value['operationId'] === 'string' &&
				isRecord(file) &&
				typeof file['id'] === 'string' &&
				(file['userId'] === null || typeof file['userId'] === 'string') &&
				(file['userHost'] === null || typeof file['userHost'] === 'string') &&
				(file['userUsername'] === null || typeof file['userUsername'] === 'string') &&
				typeof file['size'] === 'number' &&
				(file['uri'] === null || typeof file['uri'] === 'string') &&
				typeof file['storedInternal'] === 'boolean' &&
				typeof file['isLink'] === 'boolean' &&
				(file['accessKey'] === null || typeof file['accessKey'] === 'string') &&
				(file['thumbnailUrl'] === null || typeof file['thumbnailUrl'] === 'string') &&
				(file['thumbnailAccessKey'] === null || typeof file['thumbnailAccessKey'] === 'string') &&
				(file['webpublicUrl'] === null || typeof file['webpublicUrl'] === 'string') &&
				(file['webpublicAccessKey'] === null || typeof file['webpublicAccessKey'] === 'string') &&
				typeof value['isExpired'] === 'boolean' &&
				(replacementKeys === undefined ||
					(isRecord(replacementKeys) &&
						typeof replacementKeys['accessKey'] === 'string' &&
						typeof replacementKeys['thumbnailAccessKey'] === 'string' &&
						typeof replacementKeys['webpublicAccessKey'] === 'string')) &&
				(value['deleterId'] === undefined || typeof value['deleterId'] === 'string')
				? (value as DbJobMap['deleteDriveFile'])
				: null;
		}
		case 'userSuspensionPostEffects':
			return typeof value['userId'] === 'string' &&
				typeof value['isSuspended'] === 'boolean' &&
				typeof value['transitionedAt'] === 'string' &&
				typeof value['transitionId'] === 'string'
				? (value as DbJobMap['userSuspensionPostEffects'])
				: null;
		case 'notePostCreate':
			return typeof value['noteId'] === 'string' &&
				typeof value['silent'] === 'boolean' &&
				(value['reply'] === null ||
					(isRecord(value['reply']) &&
						typeof value['reply']['id'] === 'string' &&
						typeof value['reply']['userId'] === 'string' &&
						(value['reply']['userHost'] === null || typeof value['reply']['userHost'] === 'string') &&
						(value['reply']['threadId'] === null || typeof value['reply']['threadId'] === 'string'))) &&
				(value['renote'] === null ||
					(isRecord(value['renote']) &&
						typeof value['renote']['id'] === 'string' &&
						typeof value['renote']['userId'] === 'string' &&
						(value['renote']['userHost'] === null || typeof value['renote']['userHost'] === 'string') &&
						(value['renote']['uri'] === null || typeof value['renote']['uri'] === 'string'))) &&
				[
					'analytics',
					'fanout',
					'antennas',
					'followerNotifications',
					'poll',
					'streamsAndRole',
					'notifications',
					'webhooks',
					'federation',
				].includes(value['stage'] as string) &&
				Array.isArray(value['mentionedUserIds']) &&
				value['mentionedUserIds'].every((id) => typeof id === 'string')
				? (value as DbJobMap['notePostCreate'])
				: null;
		default:
			return null;
	}
}

function parseDbOutboxJob(row: QueueOutboxRow): DbJobBulkInput | null {
	if (row.queue !== QUEUE.DB || !isRecord(row.data) || !isRecord(row.opts)) return null;
	if (!['deleteAccount', 'deleteDriveFile', 'userSuspensionPostEffects', 'notePostCreate'].includes(row.name))
		return null;
	const name = row.name as OutboxDbJobName;
	const data = row.data as SerializedDeleteAccountData;
	const parsedData = parseDbJobData(name, data);
	if (parsedData == null) return null;
	const removeOnComplete = parseKeepJobs((row.opts as SerializedJobOptions).removeOnComplete);
	const removeOnFail = parseKeepJobs((row.opts as SerializedJobOptions).removeOnFail);
	if (removeOnComplete === invalidKeepJobs || removeOnFail === invalidKeepJobs) return null;
	const serializedOpts = row.opts as SerializedJobOptions;
	if (
		serializedOpts.attempts !== undefined &&
		(typeof serializedOpts.attempts !== 'number' ||
			!Number.isInteger(serializedOpts.attempts) ||
			serializedOpts.attempts < 1)
	)
		return null;
	const backoff = serializedOpts.backoff;
	if (
		backoff !== undefined &&
		(!isRecord(backoff) ||
			(backoff['type'] !== 'custom' && backoff['type'] !== 'exponential') ||
			(backoff['delay'] !== undefined && typeof backoff['delay'] !== 'number'))
	)
		return null;
	const parsedBackoff =
		backoff === undefined
			? undefined
			: {
					type: backoff['type'] as 'custom' | 'exponential',
					...(backoff['delay'] === undefined ? {} : { delay: backoff['delay'] as number }),
				};

	const opts = {
		...(serializedOpts.attempts === undefined ? {} : { attempts: serializedOpts.attempts }),
		...(parsedBackoff === undefined ? {} : { backoff: parsedBackoff }),
		...(removeOnComplete === undefined ? {} : { removeOnComplete }),
		...(removeOnFail === undefined ? {} : { removeOnFail }),
		jobId: row.externalJobId ?? `outbox-${row.id}`,
	};
	switch (name) {
		case 'deleteAccount':
			return {
				name,
				data: {
					...(parsedData as DbJobMap['deleteAccount']),
					...(row.kind === 'accountDeleteCoordinator' ? { accountDeleteCoordinatorId: row.id } : {}),
				},
				opts,
			};
		case 'deleteDriveFile':
			return { name, data: parsedData as DbJobMap['deleteDriveFile'], opts };
		case 'userSuspensionPostEffects':
			return { name, data: parsedData as DbJobMap['userSuspensionPostEffects'], opts };
		case 'notePostCreate':
			return { name, data: parsedData as DbJobMap['notePostCreate'], opts };
		default:
			return null;
	}
}

function parseDeliverOutboxJob(row: QueueOutboxRow): DeliverJobBulkInput | null {
	if (row.queue !== QUEUE.DELIVER || row.name !== 'deliver' || !isRecord(row.data) || !isRecord(row.opts)) return null;
	const envelope = row.data as SerializedDeliverEnvelope;
	if (typeof envelope.name !== 'string' || !isRecord(envelope.data)) return null;
	const data = envelope.data as SerializedDeliverData;
	if (!isRecord(data.user) || typeof (data.user as SerializedDeliverUser).id !== 'string') return null;
	if (
		typeof data.content !== 'string' ||
		typeof data.digest !== 'string' ||
		typeof data.to !== 'string' ||
		typeof data.isSharedInbox !== 'boolean'
	)
		return null;
	const opts = row.opts as SerializedJobOptions;
	if (
		opts.attempts !== undefined &&
		(typeof opts.attempts !== 'number' || !Number.isInteger(opts.attempts) || opts.attempts < 0)
	)
		return null;
	if (!isRecord(opts.backoff) || opts.backoff['type'] !== 'custom') return null;

	return {
		name: envelope.name,
		data: {
			user: { id: (data.user as SerializedDeliverUser).id as string },
			content: data.content,
			digest: data.digest,
			to: data.to,
			isSharedInbox: data.isSharedInbox,
		},
		opts: {
			...(opts.attempts === undefined ? {} : { attempts: opts.attempts }),
			backoff: { type: 'custom' },
			removeOnComplete: false,
			removeOnFail: false,
			jobId: row.externalJobId ?? `outbox-${row.id}`,
		},
	};
}

function errorDetails(error: unknown): QueueOutboxLastError {
	return { message: error instanceof Error ? error.message : String(error) };
}

function outboxJobId(row: QueueOutboxRow): string {
	return row.externalJobId ?? `outbox-${row.id}`;
}

type DeliverJobState = 'completed' | 'failed' | 'unknown' | 'inFlight' | 'pollError';

/**
 * 配送ジョブの終了状態をまとめて1往復で判定する。
 *
 * Queue#getJobState は1ジョブ毎にLuaスクリプトを1往復させるので、outbox の突合ポーリングでは
 * 行数分のラウンドトリップになる (100行で100往復 / Redisコマンド701回)。outbox 由来の配送ジョブは
 * 必ず removeOnComplete/removeOnFail=false で積むため、完了・失敗は completed / failed の ZSET に
 * 残り続ける。よって「終了しているか」だけならキー参照3つで判定でき、pipeline で1往復に畳める。
 */
async function resolveDeliverJobStates(
	deliverQueue: DeliverQueue,
	jobIds: string[],
): Promise<Map<string, DeliverJobState>> {
	const states = new Map<string, DeliverJobState>();
	if (jobIds.length === 0) return states;

	let replies: [Error | null, unknown][] | null;
	try {
		// bullmq v6 は datastore を抽象化したため生クライアントは backend 側の脱出口に移った。
		// IRedisClient 型は BullMQ 自身が使うコマンドしか宣言していないが、接続オプションから
		// 生成される実体は ioredis クライアントの Proxy (createIORedisClient) なので ioredis として扱える。
		const client = (await deliverQueue.getBackend().client) as unknown as Redis.Redis;
		const completedKey = deliverQueue.toKey('completed');
		const failedKey = deliverQueue.toKey('failed');
		const pipeline = client.pipeline();
		for (const jobId of jobIds) {
			pipeline.exists(deliverQueue.toKey(jobId));
			pipeline.zscore(completedKey, jobId);
			pipeline.zscore(failedKey, jobId);
		}
		replies = await pipeline.exec();
	} catch {
		replies = null;
	}

	for (const [index, jobId] of jobIds.entries()) {
		const exists = replies?.[index * 3];
		const completed = replies?.[index * 3 + 1];
		const failed = replies?.[index * 3 + 2];
		if (
			exists == null ||
			completed == null ||
			failed == null ||
			exists[0] != null ||
			completed[0] != null ||
			failed[0] != null
		) {
			states.set(jobId, 'pollError');
			continue;
		}
		if (completed[1] != null) states.set(jobId, 'completed');
		else if (failed[1] != null) states.set(jobId, 'failed');
		else if (exists[1] !== 1) states.set(jobId, 'unknown');
		else states.set(jobId, 'inFlight');
	}
	return states;
}

export async function enqueueDbJobInOutbox<K extends OutboxDbJobName>(
	db: MiDrizzleDatabase,
	name: K,
	data: DbJobMap[K],
	opts: Bull.BulkJobOptions,
): Promise<string> {
	const id = genId();
	await db.insert(queueOutbox).values({
		id,
		queue: QUEUE.DB,
		name,
		kind: 'job',
		data,
		opts,
		externalJobId: `outbox-${id}`,
	});
	return id;
}

export type InlineDbOutboxJob = {
	outboxId: string;
	leaseToken: string;
};

/**
 * 同一リクエストで複数ジョブを積むときは 1 文にまとめる。ノート作成は post-create の
 * ステージ数だけ enqueue するため、1 件ずつ INSERT すると往復がステージ数に比例する
 * (実測で 1 投稿 56 文中 7 文)。返り値は dataList と同じ順序で、id は生成順に単調増加する。
 */
export async function enqueueInlineDbJobsInOutbox<K extends OutboxDbJobName>(
	db: MiDrizzleDatabase,
	name: K,
	dataList: DbJobMap[K][],
	opts: Bull.BulkJobOptions,
): Promise<InlineDbOutboxJob[]> {
	if (dataList.length === 0) return [];

	const now = new Date();
	const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);
	const jobs = dataList.map(() => ({ outboxId: genId(), leaseToken: genId() }));

	await db.insert(queueOutbox).values(
		dataList.map((data, index) => ({
			id: jobs[index]!.outboxId,
			queue: QUEUE.DB,
			name,
			kind: 'job' as const,
			state: 'publishing' as const,
			data,
			opts,
			externalJobId: `outbox-${jobs[index]!.outboxId}`,
			leaseToken: jobs[index]!.leaseToken,
			leaseExpiresAt,
			updatedAt: now,
		})),
	);

	return jobs;
}

export async function enqueueInlineDbJobInOutbox<K extends OutboxDbJobName>(
	db: MiDrizzleDatabase,
	name: K,
	data: DbJobMap[K],
	opts: Bull.BulkJobOptions,
): Promise<InlineDbOutboxJob> {
	const [job] = await enqueueInlineDbJobsInOutbox(db, name, [data], opts);
	return job!;
}

export async function runInlineDbOutboxJob(
	db: MiDrizzleDatabase,
	job: InlineDbOutboxJob,
	task: (db: MiDrizzleDatabase) => Promise<void>,
): Promise<boolean> {
	try {
		return await db.transaction(async (transaction) => {
			const tx = transaction as MiDrizzleDatabase;
			const [owned] = await tx
				.select({ id: queueOutbox.id })
				.from(queueOutbox)
				.where(
					and(
						eq(queueOutbox.id, job.outboxId),
						eq(queueOutbox.state, 'publishing'),
						eq(queueOutbox.leaseToken, job.leaseToken),
					),
				)
				.for('update')
				.limit(1);
			if (owned == null) return false;

			await task(tx);
			await tx.delete(queueOutbox).where(eq(queueOutbox.id, job.outboxId));
			return true;
		});
	} catch (error) {
		await db
			.update(queueOutbox)
			.set({
				state: 'ready',
				availableAt: new Date(),
				leaseToken: null,
				leaseExpiresAt: null,
				lastError: errorDetails(error),
				updatedAt: new Date(),
				revision: sql`${queueOutbox.revision} + 1`,
			})
			.where(
				and(
					eq(queueOutbox.id, job.outboxId),
					eq(queueOutbox.state, 'publishing'),
					eq(queueOutbox.leaseToken, job.leaseToken),
				),
			);
		throw error;
	}
}

export async function enqueueDeliverJobInOutbox(
	db: MiDrizzleDatabase,
	job: DeliverJobInput,
	coordinatorId?: string,
): Promise<string> {
	const id = genId();
	await db.insert(queueOutbox).values({
		id,
		queue: QUEUE.DELIVER,
		name: 'deliver',
		kind: 'job',
		coordinatorId,
		data: { name: job.name, data: job.data },
		opts: job.opts ?? {},
		externalJobId: `outbox-${id}`,
	});
	return id;
}

export async function enqueueDeliverJobsInOutbox(
	db: MiDrizzleDatabase,
	jobs: DeliverJobInput[],
	coordinatorId: string,
): Promise<string[]> {
	const rows = jobs.map((job) => {
		const id = genId();
		return {
			id,
			queue: QUEUE.DELIVER,
			name: 'deliver',
			kind: 'job' as const,
			coordinatorId,
			data: { name: job.name, data: job.data },
			opts: job.opts ?? {},
			externalJobId: `outbox-${id}`,
		};
	});
	for (let index = 0; index < rows.length; index += 250) {
		await db.insert(queueOutbox).values(rows.slice(index, index + 250));
	}
	return rows.map((row) => row.id);
}

export async function enqueueAccountDeleteCoordinatorInOutbox(
	db: MiDrizzleDatabase,
	data: DbJobMap['deleteAccount'],
	opts: Pick<Bull.BulkJobOptions, 'removeOnComplete' | 'removeOnFail'>,
): Promise<string> {
	const id = genId();
	await db.insert(queueOutbox).values({
		id,
		queue: QUEUE.DB,
		name: 'deleteAccount',
		kind: 'accountDeleteCoordinator',
		data,
		opts,
		externalJobId: `outbox-${id}`,
	});
	return id;
}

/**
 * outbox に積んだ DB ジョブを、ディスパッチャのポーリング (最大1秒) を待たずに発行する低遅延経路。
 *
 * 発行に成功したら outbox 行をここで消す。行を残したままにすると、ジョブが完了して Valkey から
 * 消えた後 (removeOnComplete は既定で completedMaximumCount=30 なので大量削除時はすぐ溢れる) に
 * ディスパッチャが同じ jobId を再作成してしまい、アカウント削除ジョブが二重実行され得る。
 * 発行に失敗した場合は行を残すので、そのままディスパッチャの再送に委ねられる。
 */
export function publishDbOutboxRowEagerly<K extends OutboxDbJobName>(
	db: MiDrizzleDatabase,
	dbQueue: DbQueue,
	outboxId: string,
	job: Omit<DbJobBulkInput<K>, 'opts'> & { opts: Bull.BulkJobOptions },
): Promise<void> {
	return (async () => {
		await addDbJobs(dbQueue, [
			{ name: job.name, data: job.data, opts: { ...job.opts, jobId: `outbox-${outboxId}` } } as DbJobBulkInput<K>,
		]);
		await db.delete(queueOutbox).where(and(eq(queueOutbox.id, outboxId), eq(queueOutbox.state, 'ready')));
	})().catch(() => {
		// 発行できなかった行はそのまま残るので、ディスパッチャが次のポーリングで再送する
	});
}

type ClaimedRows = {
	rows: QueueOutboxRow[];
	leaseToken: string;
};

async function claimReadyRows(db: MiDrizzleDatabase): Promise<ClaimedRows> {
	const now = new Date();
	const leaseToken = genId();
	const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);
	const rows = await db.transaction(async (tx) => {
		const claimed = await tx
			.select()
			.from(queueOutbox)
			.where(sql`(
			(${queueOutbox.state} = 'ready' AND ${queueOutbox.availableAt} <= ${now})
			OR (${queueOutbox.state} = 'publishing' AND ${queueOutbox.leaseExpiresAt} <= ${now})
		) AND (
			${queueOutbox.kind} <> 'accountDeleteCoordinator'
			OR NOT EXISTS (
				SELECT 1 FROM "queue_outbox" AS child
				WHERE child."coordinatorId" = ${queueOutbox.id}
			)
		)`)
			.orderBy(queueOutbox.createdAt)
			.limit(READY_BATCH_SIZE)
			.for('update', { skipLocked: true });
		if (claimed.length === 0) return [];

		await tx
			.update(queueOutbox)
			.set({
				state: 'publishing',
				leaseToken,
				leaseExpiresAt,
				updatedAt: now,
				revision: sql`${queueOutbox.revision} + 1`,
			})
			.where(
				inArray(
					queueOutbox.id,
					claimed.map((row) => row.id),
				),
			);
		return claimed;
	});
	return { rows, leaseToken };
}

async function claimPublishedRows(db: MiDrizzleDatabase): Promise<ClaimedRows> {
	const now = new Date();
	const leaseToken = genId();
	const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);
	const rows = await db.transaction(async (tx) => {
		const claimed = await tx
			.select()
			.from(queueOutbox)
			.where(sql`
			${queueOutbox.queue} = ${QUEUE.DELIVER} AND (
				(${queueOutbox.state} = 'published' AND ${queueOutbox.availableAt} <= ${now})
				OR (${queueOutbox.state} = 'reconciling' AND ${queueOutbox.leaseExpiresAt} <= ${now})
			)
		`)
			.orderBy(queueOutbox.availableAt, queueOutbox.createdAt)
			.limit(RECONCILE_BATCH_SIZE)
			.for('update', { skipLocked: true });
		if (claimed.length === 0) return [];

		await tx
			.update(queueOutbox)
			.set({
				state: 'reconciling',
				leaseToken,
				leaseExpiresAt,
				updatedAt: now,
				revision: sql`${queueOutbox.revision} + 1`,
			})
			.where(
				inArray(
					queueOutbox.id,
					claimed.map((row) => row.id),
				),
			);
		return claimed;
	});
	return { rows, leaseToken };
}

function claimedWhere(ids: string[], state: 'publishing' | 'reconciling', leaseToken: string) {
	return and(inArray(queueOutbox.id, ids), eq(queueOutbox.state, state), eq(queueOutbox.leaseToken, leaseToken));
}

async function markDeadLetter(
	db: MiDrizzleDatabase,
	ids: string[],
	claimedState: 'publishing' | 'reconciling',
	leaseToken: string,
	reason: QueueOutboxDeadLetterReason,
	error: QueueOutboxLastError,
): Promise<void> {
	if (ids.length === 0) return;
	await db
		.update(queueOutbox)
		.set({
			state: 'deadLetter',
			deadLetterReason: reason,
			lastError: error,
			leaseToken: null,
			leaseExpiresAt: null,
			updatedAt: new Date(),
			revision: sql`${queueOutbox.revision} + 1`,
		})
		.where(claimedWhere(ids, claimedState, leaseToken));
}

async function releaseReadyClaims(
	db: MiDrizzleDatabase,
	ids: string[],
	leaseToken: string,
	error: unknown,
): Promise<void> {
	if (ids.length === 0) return;
	await db
		.update(queueOutbox)
		.set({
			state: 'ready',
			availableAt: new Date(Date.now() + 1000),
			leaseToken: null,
			leaseExpiresAt: null,
			lastError: errorDetails(error),
			updatedAt: new Date(),
			revision: sql`${queueOutbox.revision} + 1`,
		})
		.where(claimedWhere(ids, 'publishing', leaseToken));
}

async function dispatchReadyOutbox(
	db: MiDrizzleDatabase,
	dbQueue: DbQueue,
	deliverQueue: DeliverQueue,
): Promise<number> {
	const { rows, leaseToken } = await claimReadyRows(db);
	if (rows.length === 0) return 0;

	const deliverRows = rows.flatMap((row) => {
		const job = parseDeliverOutboxJob(row);
		return row.queue === QUEUE.DELIVER && job != null ? [{ row, job }] : [];
	});
	const dbRows = rows.flatMap((row) => {
		const job = parseDbOutboxJob(row);
		return row.queue === QUEUE.DB && job != null ? [{ row, job }] : [];
	});
	const validIds = new Set([...deliverRows, ...dbRows].map(({ row }) => row.id));
	const invalidIds = rows.filter((row) => !validIds.has(row.id)).map((row) => row.id);
	await markDeadLetter(db, invalidIds, 'publishing', leaseToken, 'invalidPayload', {
		message: 'Queue outbox payload is invalid',
	});

	let dispatched = 0;
	if (deliverRows.length > 0) {
		const ids = deliverRows.map(({ row }) => row.id);
		try {
			await addDeliverJobs(
				deliverQueue,
				deliverRows.map(({ job }) => job),
			);
			await db
				.update(queueOutbox)
				.set({
					state: 'published',
					availableAt: new Date(Date.now() + 1000),
					pollIntervalMs: 1000,
					leaseToken: null,
					leaseExpiresAt: null,
					lastError: null,
					updatedAt: new Date(),
					revision: sql`${queueOutbox.revision} + 1`,
				})
				.where(claimedWhere(ids, 'publishing', leaseToken));
			dispatched += ids.length;
		} catch (error) {
			await releaseReadyClaims(db, ids, leaseToken, error);
		}
	}

	if (dbRows.length > 0) {
		const ids = dbRows.map(({ row }) => row.id);
		try {
			await addDbJobs(
				dbQueue,
				dbRows.map(({ job }) => job),
			);
			await db.delete(queueOutbox).where(claimedWhere(ids, 'publishing', leaseToken));
			dispatched += ids.length;
		} catch (error) {
			await releaseReadyClaims(db, ids, leaseToken, error);
		}
	}

	return dispatched;
}

async function restorePublishedRows(db: MiDrizzleDatabase, rows: QueueOutboxRow[], leaseToken: string): Promise<void> {
	const grouped = new Map<number, string[]>();
	for (const row of rows) {
		const interval = Math.min(MAX_POLL_INTERVAL_MS, Math.max(1000, row.pollIntervalMs * 2));
		grouped.set(interval, [...(grouped.get(interval) ?? []), row.id]);
	}
	for (const [interval, ids] of grouped) {
		await db
			.update(queueOutbox)
			.set({
				state: 'published',
				availableAt: new Date(Date.now() + interval),
				pollIntervalMs: interval,
				leaseToken: null,
				leaseExpiresAt: null,
				updatedAt: new Date(),
				revision: sql`${queueOutbox.revision} + 1`,
			})
			.where(claimedWhere(ids, 'reconciling', leaseToken));
	}
}

async function reconcilePublishedDeliveries(db: MiDrizzleDatabase, deliverQueue: DeliverQueue): Promise<void> {
	const { rows, leaseToken } = await claimPublishedRows(db);
	if (rows.length === 0) return;

	const validRows = rows.filter((row) => parseDeliverOutboxJob(row) != null);
	const invalidIds = rows.filter((row) => parseDeliverOutboxJob(row) == null).map((row) => row.id);
	await markDeadLetter(db, invalidIds, 'reconciling', leaseToken, 'invalidPayload', {
		message: 'Queue outbox payload is invalid',
	});

	const states = await resolveDeliverJobStates(
		deliverQueue,
		validRows.map((row) => outboxJobId(row)),
	);
	const byState = (target: DeliverJobState) => validRows.filter((row) => states.get(outboxJobId(row)) === target);
	const completed = byState('completed');
	const failed = byState('failed');
	const unknown = byState('unknown');
	const waiting = validRows.filter((row) => {
		const state = states.get(outboxJobId(row));
		return state !== 'completed' && state !== 'failed' && state !== 'unknown';
	});

	await Promise.all(completed.map((row) => deliverQueue.remove(outboxJobId(row))));
	if (completed.length > 0) {
		await db.delete(queueOutbox).where(
			claimedWhere(
				completed.map((row) => row.id),
				'reconciling',
				leaseToken,
			),
		);
	}

	for (const row of failed) {
		const job = await deliverQueue.getJob(outboxJobId(row));
		await markDeadLetter(db, [row.id], 'reconciling', leaseToken, 'deliveryFailed', {
			message: job?.failedReason ?? 'Delivery job failed',
			...(job == null ? {} : { attemptsMade: job.attemptsMade }),
			...(job?.stacktrace == null ? {} : { stacktrace: job.stacktrace }),
		});
	}

	if (unknown.length > 0) {
		await db
			.update(queueOutbox)
			.set({
				state: 'ready',
				availableAt: new Date(),
				pollIntervalMs: 1000,
				leaseToken: null,
				leaseExpiresAt: null,
				updatedAt: new Date(),
				revision: sql`${queueOutbox.revision} + 1`,
			})
			.where(
				claimedWhere(
					unknown.map((row) => row.id),
					'reconciling',
					leaseToken,
				),
			);
	}
	await restorePublishedRows(db, waiting, leaseToken);
}

export async function dispatchQueueOutbox(
	db: MiDrizzleDatabase,
	dbQueue: DbQueue,
	deliverQueue: DeliverQueue,
): Promise<number> {
	await reconcilePublishedDeliveries(db, deliverQueue);
	return await dispatchReadyOutbox(db, dbQueue, deliverQueue);
}

export async function getQueueOutboxStats(db: MiDrizzleDatabase): Promise<{
	pending: number;
	deadLetter: number;
	deliveryFailed: number;
	invalidPayload: number;
	oldestPendingAgeMs: number | null;
}> {
	const [stats] = await db
		.select({
			pending: sql<number>`count(*) FILTER (WHERE ${queueOutbox.state} <> 'deadLetter')::integer`,
			deadLetter: sql<number>`count(*) FILTER (WHERE ${queueOutbox.state} = 'deadLetter')::integer`,
			deliveryFailed: sql<number>`count(*) FILTER (WHERE ${queueOutbox.deadLetterReason} = 'deliveryFailed')::integer`,
			invalidPayload: sql<number>`count(*) FILTER (WHERE ${queueOutbox.deadLetterReason} = 'invalidPayload')::integer`,
			// 生の sql`` で timestamptz を select すると drizzle のカラム変換を通らず文字列のまま返るため、
			// 経過時間の計算自体を SQL 側で済ませて double precision (= pg が number にパースする型) で受ける。
			oldestPendingAgeMs: sql<
				number | null
			>`(extract(epoch from (now() - min(${queueOutbox.createdAt}) FILTER (WHERE ${queueOutbox.state} <> 'deadLetter'))) * 1000)::double precision`,
		})
		.from(queueOutbox);
	if (stats == null) throw new Error('Queue outbox aggregate query returned no rows');

	return {
		pending: stats.pending,
		deadLetter: stats.deadLetter,
		deliveryFailed: stats.deliveryFailed,
		invalidPayload: stats.invalidPayload,
		oldestPendingAgeMs: stats.oldestPendingAgeMs == null ? null : Math.max(0, stats.oldestPendingAgeMs),
	};
}

export async function retryDeadLetterOutboxInDatabase(
	db: MiDrizzleDatabase,
	id: string,
	revision: number,
): Promise<boolean> {
	const rows = await db
		.update(queueOutbox)
		.set({
			state: 'ready',
			availableAt: new Date(),
			pollIntervalMs: 1000,
			deadLetterReason: null,
			lastError: null,
			leaseToken: null,
			leaseExpiresAt: null,
			updatedAt: new Date(),
			revision: sql`${queueOutbox.revision} + 1`,
		})
		.where(and(eq(queueOutbox.id, id), eq(queueOutbox.state, 'deadLetter'), eq(queueOutbox.revision, revision)))
		.returning({ id: queueOutbox.id });
	return rows.length > 0;
}

export async function abandonDeadLetterOutboxInDatabase(
	db: MiDrizzleDatabase,
	id: string,
	revision: number,
): Promise<boolean> {
	const rows = await db
		.delete(queueOutbox)
		.where(and(eq(queueOutbox.id, id), eq(queueOutbox.state, 'deadLetter'), eq(queueOutbox.revision, revision)))
		.returning({ id: queueOutbox.id });
	return rows.length > 0;
}

/**
 * id (時系列順) の降順で返す。updatedAt 順にすると retry/abandon のたびに並びが変わって
 * ページングが破綻するうえ、古いデッドレターに到達できなくなる。
 */
export async function listDeadLetterQueueOutboxFromDatabase(
	db: MiDrizzleDatabase,
	limit: number,
	untilId?: string,
): Promise<QueueOutboxRow[]> {
	return await db
		.select()
		.from(queueOutbox)
		.where(and(eq(queueOutbox.state, 'deadLetter'), untilId == null ? undefined : lt(queueOutbox.id, untilId)))
		.orderBy(desc(queueOutbox.id))
		.limit(limit);
}

export async function fetchQueueOutboxByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: string,
): Promise<QueueOutboxRow | null> {
	const [row] = await db.select().from(queueOutbox).where(eq(queueOutbox.id, id)).limit(1);
	return row ?? null;
}
