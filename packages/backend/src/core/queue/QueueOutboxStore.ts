/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, desc, eq, getTableName, inArray, lt, or, sql } from 'drizzle-orm';
import { defineQueryPlan } from '@/db/prepared.js';
import type * as Bull from 'bullmq';
import type * as Redis from 'ioredis';
import { addDbJobs, addDeliverJobs } from '@/core/queue/queues.js';
import type {
	DbJobBulkInput,
	DbQueue,
	DeliverJobBulkInput,
	DeliverJobInput,
	DeliverQueue,
} from '@/core/queue/queues.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import type {
	QueueOutboxDeadLetterReason,
	QueueOutboxInsert,
	QueueOutboxLastError,
	QueueOutboxRow,
} from '@/db/schema/queue-outbox.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { QUEUE } from '@/queue/const.js';
import type { DbJobMap } from '@/queue/types.js';

const CLAIM_LEASE_MS = 30_000;
const MAX_POLL_INTERVAL_MS = 30_000;
const READY_BATCH_SIZE = 500;
const RECONCILE_BATCH_SIZE = 500;
// 待機元が終了した場合も実行結果を蓄積し続けない。期限切れは成功ではなく結果不明とする。
const EXECUTION_OUTCOME_TTL_MS = 60 * 60 * 1000;

type OutboxDbJobName = 'deleteAccount' | 'deleteDriveFile' | 'userSuspensionPostEffects' | 'notePostCreate';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function awaitsDbExecution(row: Pick<QueueOutboxRow, 'queue' | 'name' | 'data'>): boolean {
	return (
		row.queue === QUEUE.DB &&
		row.name === 'notePostCreate' &&
		isRecord(row.data) &&
		(row.data['stage'] === 'fanout' || row.data['stage'] === 'antennas')
	);
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
	if (value === undefined || typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) && value >= 0 ? value : invalidKeepJobs;
	}
	if (!isRecord(value)) {
		return invalidKeepJobs;
	}

	const serialized = value as SerializedKeepJobs;
	const { age, count, limit } = serialized;
	if (age === undefined) {
		return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? { count } : invalidKeepJobs;
	}
	if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) {
		return invalidKeepJobs;
	}
	if (count !== undefined && (typeof count !== 'number' || !Number.isFinite(count) || count < 0)) {
		return invalidKeepJobs;
	}
	if (limit !== undefined && (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0)) {
		return invalidKeepJobs;
	}
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
			if (!isRecord(user) || typeof (user as SerializedDeleteAccountUser).id !== 'string') {
				return null;
			}
			if (value['soft'] !== undefined && typeof value['soft'] !== 'boolean') {
				return null;
			}
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
	if (row.queue !== QUEUE.DB || !isRecord(row.data) || !isRecord(row.opts)) {
		return null;
	}
	if (!['deleteAccount', 'deleteDriveFile', 'userSuspensionPostEffects', 'notePostCreate'].includes(row.name)) {
		return null;
	}
	const name = row.name as OutboxDbJobName;
	const data = row.data as SerializedDeleteAccountData;
	const parsedData = parseDbJobData(name, data);
	if (parsedData == null) {
		return null;
	}
	const removeOnComplete = parseKeepJobs((row.opts as SerializedJobOptions).removeOnComplete);
	const removeOnFail = parseKeepJobs((row.opts as SerializedJobOptions).removeOnFail);
	if (removeOnComplete === invalidKeepJobs || removeOnFail === invalidKeepJobs) {
		return null;
	}
	const serializedOpts = row.opts as SerializedJobOptions;
	if (
		serializedOpts.attempts !== undefined &&
		(typeof serializedOpts.attempts !== 'number' ||
			!Number.isInteger(serializedOpts.attempts) ||
			serializedOpts.attempts < 1)
	) {
		return null;
	}
	const backoff = serializedOpts.backoff;
	if (
		backoff !== undefined &&
		(!isRecord(backoff) ||
			(backoff['type'] !== 'custom' && backoff['type'] !== 'exponential') ||
			(backoff['delay'] !== undefined && typeof backoff['delay'] !== 'number'))
	) {
		return null;
	}
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
	if (row.queue !== QUEUE.DELIVER || row.name !== 'deliver' || !isRecord(row.data) || !isRecord(row.opts)) {
		return null;
	}
	const envelope = row.data as SerializedDeliverEnvelope;
	if (typeof envelope.name !== 'string' || !isRecord(envelope.data)) {
		return null;
	}
	const data = envelope.data as SerializedDeliverData;
	if (!isRecord(data.user) || typeof (data.user as SerializedDeliverUser).id !== 'string') {
		return null;
	}
	if (
		typeof data.content !== 'string' ||
		typeof data.digest !== 'string' ||
		typeof data.to !== 'string' ||
		typeof data.isSharedInbox !== 'boolean'
	) {
		return null;
	}
	const opts = row.opts as SerializedJobOptions;
	if (
		opts.attempts !== undefined &&
		(typeof opts.attempts !== 'number' || !Number.isInteger(opts.attempts) || opts.attempts < 0)
	) {
		return null;
	}
	if (!isRecord(opts.backoff) || opts.backoff['type'] !== 'custom') {
		return null;
	}

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
	if (jobIds.length === 0) {
		return states;
	}

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
		if (completed[1] != null) {
			states.set(jobId, 'completed');
		} else if (failed[1] != null) {
			states.set(jobId, 'failed');
		} else if (exists[1] !== 1) {
			states.set(jobId, 'unknown');
		} else {
			states.set(jobId, 'inFlight');
		}
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
 * 行数ごとに INSERT の形が変わるので、行数を key に含めて固定形を持つ。notePostCreate のステージ数
 * (数行) を想定した上限で、超える場合は従来どおり組み立てる。
 */
export const MAX_PREPARED_INLINE_JOB_ROWS = 16;

function inlineJobInsertPlaceholders(rowCount: number): QueueOutboxInsert[] {
	const placeholder = (name: string) => sql.placeholder(name) as unknown as string;
	return Array.from({ length: rowCount }, (_, index) => ({
		id: placeholder(`id${index}`),
		queue: QUEUE.DB,
		name: placeholder('name'),
		kind: 'job' as const,
		state: 'publishing' as const,
		data: sql.placeholder(`data${index}`) as unknown as QueueOutboxInsert['data'],
		opts: sql.placeholder('opts') as unknown as QueueOutboxInsert['opts'],
		externalJobId: placeholder(`externalJobId${index}`),
		leaseToken: placeholder(`leaseToken${index}`),
		leaseExpiresAt: sql.placeholder('leaseExpiresAt') as unknown as Date,
		updatedAt: sql.placeholder('updatedAt') as unknown as Date,
	}));
}

export function createInlineDbOutboxInsert(db: MiDrizzleDatabase, rowCount: number) {
	return db.insert(queueOutbox).values(inlineJobInsertPlaceholders(rowCount));
}

const inlineJobInsertPlans = Array.from({ length: MAX_PREPARED_INLINE_JOB_ROWS }, (_, index) =>
	defineQueryPlan((db) => ({
		query: createInlineDbOutboxInsert(db, index + 1),
		metadata: { type: 'insert', tables: [getTableName(queueOutbox)] },
		mutationTables: [queueOutbox],
	})),
);

export function prepareInlineDbOutboxJobs<K extends OutboxDbJobName>(
	name: K,
	dataList: DbJobMap[K][],
	opts: Bull.BulkJobOptions,
) {
	const now = new Date();
	const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);
	const jobs = dataList.map(() => ({ outboxId: genId(), leaseToken: genId() }));
	const values: Record<string, unknown> & { leaseExpiresAt: Date; updatedAt: Date } = {
		name,
		opts,
		leaseExpiresAt,
		updatedAt: now,
	};
	dataList.forEach((data, index) => {
		values[`id${index}`] = jobs[index]!.outboxId;
		values[`data${index}`] = data;
		values[`externalJobId${index}`] = `outbox-${jobs[index]!.outboxId}`;
		values[`leaseToken${index}`] = jobs[index]!.leaseToken;
	});
	return { jobs, values };
}

export async function enqueueInlineDbJobsInOutbox<K extends OutboxDbJobName>(
	db: MiDrizzleDatabase,
	name: K,
	dataList: DbJobMap[K][],
	opts: Bull.BulkJobOptions,
): Promise<InlineDbOutboxJob[]> {
	if (dataList.length === 0) {
		return [];
	}

	const { jobs, values } = prepareInlineDbOutboxJobs(name, dataList, opts);

	if (dataList.length <= MAX_PREPARED_INLINE_JOB_ROWS) {
		await inlineJobInsertPlans[dataList.length - 1]!.execute(db, values);
		return jobs;
	}

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
			leaseExpiresAt: values.leaseExpiresAt,
			updatedAt: values.updatedAt,
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

/** 失敗・inline 辞退のどちらも、現在の所有者の行だけを再試行可能に戻す。 */
export async function releaseDbOutboxJobs(
	db: MiDrizzleDatabase,
	jobs: InlineDbOutboxJob[],
	error?: unknown,
	delayMs = 0,
): Promise<void> {
	if (jobs.length === 0) {
		return;
	}
	const idsByToken = new Map<string, string[]>();
	for (const job of jobs) {
		const ids = idsByToken.get(job.leaseToken);
		if (ids == null) idsByToken.set(job.leaseToken, [job.outboxId]);
		else ids.push(job.outboxId);
	}
	await db
		.update(queueOutbox)
		.set({
			state: 'ready',
			availableAt: new Date(Date.now() + delayMs),
			leaseToken: null,
			leaseExpiresAt: null,
			lastError: error === undefined ? null : errorDetails(error),
			updatedAt: new Date(),
			revision: sql`${queueOutbox.revision} + 1`,
		})
		.where(or(...Array.from(idsByToken, ([token, ids]) => claimedWhere(ids, 'publishing', token))));
}

// id と lease token の組を配列で渡して照合する。行数ごとに OR を連ねると件数の分だけ SQL の形が増え、
// 2 組で 0.14ms / 3 組で 0.18ms と組数に比例して重かった。unnest なら行数によらず 1 つの形になる。
const inlineJobDeletionPlan = defineQueryPlan((db) => {
	const selection = { id: queueOutbox.id };
	return {
		query: db
			.delete(queueOutbox)
			.where(
				and(
					eq(queueOutbox.state, 'publishing'),
					sql`(${queueOutbox.id}, ${queueOutbox.leaseToken}) IN (SELECT * FROM unnest(${sql.placeholder('ids')}::varchar[], ${sql.placeholder('leaseTokens')}::varchar[]))`,
				),
			)
			.returning(selection),
		selection,
		metadata: { type: 'delete', tables: [getTableName(queueOutbox)] },
		mutationTables: [queueOutbox],
	};
});

/**
 * DELETE が持つ行ロックを callback の SQL と同じ transaction で保持する。
 * 期限超過でも引継ぎを許さず、失敗・強制停止では削除と副作用を一緒に rollback する。
 */
export async function runInlineDbOutboxJobs(
	db: MiDrizzleDatabase,
	jobs: InlineDbOutboxJob[],
	task: (db: MiDrizzleDatabase, ownedIds: ReadonlySet<string>) => Promise<void>,
	options: {
		/**
		 * COMMIT で WAL の書き出しを待たない。transaction 内の書き込みが outbox 行の削除だけで、段の処理が
		 * 冪等なときだけ使う。クラッシュで失われるのは削除ごとなので、回復処理が同じ段をもう一度実行する。
		 */
		asyncCommit?: boolean;
	} = {},
): Promise<ReadonlySet<string>> {
	if (jobs.length === 0) return new Set<string>();
	try {
		return await db.transaction(async (transaction) => {
			const tx = transaction as MiDrizzleDatabase;
			if (options.asyncCommit) await tx.execute(sql`SET LOCAL synchronous_commit = off`);
			const deleted = await inlineJobDeletionPlan.execute(tx, {
				ids: jobs.map((job) => job.outboxId),
				leaseTokens: jobs.map((job) => job.leaseToken),
			});
			const ownedIds = new Set(deleted.map((row) => row.id));
			if (ownedIds.size > 0) await task(tx, ownedIds);
			return ownedIds;
		});
	} catch (error) {
		try {
			await releaseDbOutboxJobs(db, jobs, error);
		} catch (releaseError) {
			throw new AggregateError([error, releaseError], 'Outbox execution and claim release failed', {
				cause: releaseError,
			});
		}
		throw error;
	}
}

/** inline の引継ぎ後も、fanout/antenna は queue 受理ではなく処理終了まで待つ。 */
export async function waitForDbOutboxJob(db: MiDrizzleDatabase, dbQueue: DbQueue, outboxId: string): Promise<void> {
	for (;;) {
		const row = await fetchQueueOutboxByIdFromDatabase(db, outboxId);
		if (row == null) throw new Error(`Queue outbox execution outcome is unavailable: ${outboxId}`);
		if (row.state === 'deadLetter') {
			throw new Error(row.lastError?.message ?? 'Queue outbox job is dead-lettered');
		}
		if (row.state === 'completed') {
			await db.delete(queueOutbox).where(and(eq(queueOutbox.id, outboxId), eq(queueOutbox.state, 'completed')));
			return;
		}
		const job = await dbQueue.getJob(row.externalJobId ?? `outbox-${outboxId}`);
		if ((await job?.getState()) === 'failed') throw new Error(job?.failedReason ?? 'Queue outbox job failed');
		await new Promise<void>((resolve) => setTimeout(resolve, 25));
	}
}

/** SQL の実行結果は Bull の retention・管理操作とは独立に確定する。 */
export async function runQueuedDbOutboxJob(
	db: MiDrizzleDatabase,
	jobId: string,
	task: (db: MiDrizzleDatabase) => Promise<void>,
	finalAttempt: boolean,
): Promise<void> {
	const outboxId = jobId.slice('outbox-'.length);
	try {
		await db.transaction(async (transaction) => {
			const tx = transaction as MiDrizzleDatabase;
			const [row] = await tx.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId)).for('update');
			if (row == null || row.state === 'completed') return;
			if (!awaitsDbExecution(row)) throw new Error('Queue outbox execution payload does not match');
			if (row.state === 'deadLetter') throw new Error(row.lastError?.message ?? 'Queue outbox job is dead-lettered');
			await task(tx);
			await tx
				.update(queueOutbox)
				.set({
					state: 'completed',
					availableAt: new Date(Date.now() + EXECUTION_OUTCOME_TTL_MS),
					leaseToken: null,
					leaseExpiresAt: null,
					lastError: null,
					updatedAt: new Date(),
					revision: sql`${queueOutbox.revision} + 1`,
				})
				.where(eq(queueOutbox.id, outboxId));
		});
	} catch (error) {
		await db
			.update(queueOutbox)
			.set({
				...(finalAttempt
					? {
							state: 'deadLetter' as const,
							deadLetterReason: 'deliveryFailed' as const,
							leaseToken: null,
							leaseExpiresAt: null,
						}
					: {}),
				lastError: errorDetails(error),
				updatedAt: new Date(),
				revision: sql`${queueOutbox.revision} + 1`,
			})
			.where(
				and(
					eq(queueOutbox.id, outboxId),
					inArray(queueOutbox.state, ['ready', 'publishing', 'published', 'reconciling']),
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

export async function publishDbOutboxRowEagerly(
	db: MiDrizzleDatabase,
	dbQueue: DbQueue,
	outboxId: string,
): Promise<void> {
	try {
		const { rows, leaseToken } = await claimReadyRows(db, outboxId);
		await publishClaimedDbRows(db, dbQueue, rows, leaseToken);
	} catch (error) {
		// 投稿・削除の transaction は確定済み。SQL に残る行はポーリングで回復する。
		console.error(`Failed to eagerly publish outbox ${outboxId}`, error);
	}
}

type ClaimedRows = {
	rows: QueueOutboxRow[];
	leaseToken: string;
};

async function claimReadyRows(db: MiDrizzleDatabase, outboxId?: string): Promise<ClaimedRows> {
	const now = new Date();
	const leaseToken = genId();
	const candidates = db.$with('ready_candidates').as(
		db
			.select()
			.from(queueOutbox)
			// availableAt の既定値と同じ DB 時計で判定し、JS のミリ秒丸めや時計差で即時発行を遅らせない。
			.where(
				and(
					outboxId == null ? undefined : eq(queueOutbox.id, outboxId),
					sql`(
			(${queueOutbox.state} = 'ready' AND ${queueOutbox.availableAt} <= CURRENT_TIMESTAMP)
			OR (${queueOutbox.state} = 'publishing' AND ${queueOutbox.leaseExpiresAt} <= ${now})
		) AND (
			${queueOutbox.kind} <> 'accountDeleteCoordinator'
			OR NOT EXISTS (
				SELECT 1 FROM "queue_outbox" AS child
				WHERE child."coordinatorId" = ${queueOutbox.id}
			)
		)`,
				),
			)
			.orderBy(queueOutbox.createdAt)
			.limit(READY_BATCH_SIZE)
			.for('update', { skipLocked: true }),
	);
	const claimed = db.$with('ready_claimed').as(
		db
			.update(queueOutbox)
			.set({
				state: 'publishing',
				leaseToken,
				leaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
				updatedAt: now,
				revision: sql`${queueOutbox.revision} + 1`,
			})
			.where(inArray(queueOutbox.id, db.select({ id: candidates.id }).from(candidates)))
			.returning({ id: queueOutbox.id }),
	);
	// ロック付き候補 CTE は更新完了まで保持される。返す payload は更新前の候補から取り、再取得しない。
	const rows = await db
		.with(candidates, claimed)
		.select()
		.from(candidates)
		.where(inArray(candidates.id, db.select({ id: claimed.id }).from(claimed)))
		.orderBy(candidates.createdAt);
	return { rows, leaseToken };
}

async function claimPublishedRows(db: MiDrizzleDatabase): Promise<ClaimedRows> {
	const now = new Date();
	const leaseToken = genId();
	const selectCandidates = (queue: string) =>
		db
			.select()
			.from(queueOutbox)
			.where(sql`
			${queueOutbox.queue} = ${queue} AND (
				(${queueOutbox.state} = 'published' AND ${queueOutbox.availableAt} <= ${now})
				OR (${queueOutbox.state} = 'reconciling' AND ${queueOutbox.leaseExpiresAt} <= ${now})
			)
		`)
			.orderBy(queueOutbox.availableAt, queueOutbox.createdAt)
			.limit(RECONCILE_BATCH_SIZE)
			.for('update', { skipLocked: true });
	// 各 queue の上限を独立に適用し、一方の滞留で他方の再調停を飢餓状態にしない。
	const deliveryCandidates = db.$with('delivery_candidates').as(selectCandidates(QUEUE.DELIVER));
	const dbCandidates = db.$with('db_candidates').as(selectCandidates(QUEUE.DB));
	const candidates = db
		.$with('published_candidates')
		.as(db.select().from(deliveryCandidates).unionAll(db.select().from(dbCandidates)));
	const claimed = db.$with('published_claimed').as(
		db
			.update(queueOutbox)
			.set({
				state: 'reconciling',
				leaseToken,
				leaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
				updatedAt: now,
				revision: sql`${queueOutbox.revision} + 1`,
			})
			.where(inArray(queueOutbox.id, db.select({ id: candidates.id }).from(candidates)))
			.returning({ id: queueOutbox.id }),
	);
	// データ変更 CTE は参照されなくても完走する。completed の削除と claim の対象状態は交差しない。
	const expired = db
		.$with('expired_outcomes')
		.as(db.delete(queueOutbox).where(and(eq(queueOutbox.state, 'completed'), lt(queueOutbox.availableAt, now))));
	const rows = await db
		.with(deliveryCandidates, dbCandidates, candidates, claimed, expired)
		.select()
		.from(candidates)
		.where(inArray(candidates.id, db.select({ id: claimed.id }).from(claimed)))
		.orderBy(candidates.availableAt, candidates.createdAt);
	return { rows, leaseToken };
}

function claimedWhere(ids: string[], state: 'publishing' | 'reconciling', leaseToken: string) {
	return and(inArray(queueOutbox.id, ids), eq(queueOutbox.state, state), eq(queueOutbox.leaseToken, leaseToken));
}

/**
 * リース期限は他の実行者が取得できる時刻であり、実行中の排他は行ロックが担う。
 * 待機後は必ず token/state を再確認する。同じ token の期限超過はロック取得で再取得し、
 * 引継ぎ済みの古い実行者には副作用も完了更新も許さない。強制停止では SQL が rollback される。
 */
async function withOutboxClaim(
	db: MiDrizzleDatabase,
	ids: string[],
	state: 'publishing' | 'reconciling',
	leaseToken: string,
	task: (tx: MiDrizzleDatabase, rows: QueueOutboxRow[]) => Promise<void>,
): Promise<number> {
	if (ids.length === 0) return 0;
	return await db.transaction(async (transaction) => {
		const tx = transaction as MiDrizzleDatabase;
		const rows = await tx
			.select()
			.from(queueOutbox)
			.where(claimedWhere(ids, state, leaseToken))
			.orderBy(queueOutbox.id)
			.for('update');
		if (rows.length === 0) return 0;
		await task(tx, rows);
		return rows.length;
	});
}

async function publishClaimedDbRows(
	db: MiDrizzleDatabase,
	dbQueue: DbQueue,
	rows: QueueOutboxRow[],
	leaseToken: string,
): Promise<number> {
	const ids = rows.map((row) => row.id);
	try {
		return await withOutboxClaim(db, ids, 'publishing', leaseToken, async (tx, owned) => {
			const jobs: DbJobBulkInput[] = [];
			const validIds: string[] = [];
			const executionIds: string[] = [];
			const invalidIds: string[] = [];
			for (const row of owned) {
				const job = parseDbOutboxJob(row);
				if (job == null) {
					invalidIds.push(row.id);
				} else {
					jobs.push(job);
					if (awaitsDbExecution(row)) executionIds.push(row.id);
					else validIds.push(row.id);
				}
			}
			await markDeadLetter(tx, invalidIds, 'publishing', leaseToken, 'invalidPayload', {
				message: 'Queue outbox payload is invalid',
			});
			if (jobs.length === 0) return;
			await addDbJobs(dbQueue, jobs);
			// 通常の DB job は受理まで。応答が待つステージだけは実行確認まで SQL を保持する。
			if (validIds.length > 0) await tx.delete(queueOutbox).where(claimedWhere(validIds, 'publishing', leaseToken));
			if (executionIds.length > 0) {
				await tx
					.update(queueOutbox)
					.set({
						state: 'published',
						availableAt: new Date(Date.now() + 1000),
						leaseToken: null,
						leaseExpiresAt: null,
						lastError: null,
						updatedAt: new Date(),
						revision: sql`${queueOutbox.revision} + 1`,
					})
					.where(claimedWhere(executionIds, 'publishing', leaseToken));
			}
		});
	} catch (error) {
		await releaseDbOutboxJobs(
			db,
			ids.map((outboxId) => ({ outboxId, leaseToken })),
			error,
			1000,
		);
		return 0;
	}
}

async function markDeadLetter(
	db: MiDrizzleDatabase,
	ids: string[],
	claimedState: 'publishing' | 'reconciling',
	leaseToken: string,
	reason: QueueOutboxDeadLetterReason,
	error: QueueOutboxLastError,
): Promise<void> {
	if (ids.length === 0) {
		return;
	}
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

async function dispatchReadyOutbox(
	db: MiDrizzleDatabase,
	dbQueue: DbQueue,
	deliverQueue: DeliverQueue,
): Promise<number> {
	const { rows, leaseToken } = await claimReadyRows(db);
	if (rows.length === 0) {
		return 0;
	}

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
			dispatched += await withOutboxClaim(db, ids, 'publishing', leaseToken, async (tx, owned) => {
				await addDeliverJobs(
					deliverQueue,
					owned.map((row) => parseDeliverOutboxJob(row)!),
				);
				await tx
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
					.where(
						claimedWhere(
							owned.map((row) => row.id),
							'publishing',
							leaseToken,
						),
					);
			});
		} catch (error) {
			await releaseDbOutboxJobs(
				db,
				ids.map((outboxId) => ({ outboxId, leaseToken })),
				error,
				1000,
			);
		}
	}

	dispatched += await publishClaimedDbRows(
		db,
		dbQueue,
		dbRows.map(({ row }) => row),
		leaseToken,
	);

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

async function reconcilePublishedDeliveries(
	db: MiDrizzleDatabase,
	deliverQueue: DeliverQueue,
	{ rows, leaseToken }: ClaimedRows,
): Promise<void> {
	if (rows.length === 0) {
		return;
	}

	await withOutboxClaim(
		db,
		rows.map((row) => row.id),
		'reconciling',
		leaseToken,
		async (db, rows) => {
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
		},
	);
}

async function reconcilePublishedDbExecutions(
	db: MiDrizzleDatabase,
	dbQueue: DbQueue,
	{ rows, leaseToken }: ClaimedRows,
): Promise<void> {
	await withOutboxClaim(
		db,
		rows.map((row) => row.id),
		'reconciling',
		leaseToken,
		async (tx, owned) => {
			const waiting: QueueOutboxRow[] = [];
			for (const row of owned) {
				const job = await dbQueue.getJob(outboxJobId(row));
				const state = await job?.getState();
				if (job != null && state === 'failed') {
					await markDeadLetter(tx, [row.id], 'reconciling', leaseToken, 'deliveryFailed', {
						message: job.failedReason || 'DB stage failed',
						attemptsMade: job.attemptsMade,
					});
				} else if (job == null || state === 'unknown' || state === 'completed') {
					// Bull の消失・完了だけでは実行を認めない。SQL 完了がなければ元の payload で再発行する。
					if (state === 'completed') await job?.remove();
					await tx
						.update(queueOutbox)
						.set({
							state: 'ready',
							availableAt: new Date(),
							leaseToken: null,
							leaseExpiresAt: null,
							pollIntervalMs: 1000,
							updatedAt: new Date(),
							revision: sql`${queueOutbox.revision} + 1`,
						})
						.where(claimedWhere([row.id], 'reconciling', leaseToken));
				} else {
					waiting.push(row);
				}
			}
			await restorePublishedRows(tx, waiting, leaseToken);
		},
	);
}

export async function dispatchQueueOutbox(
	db: MiDrizzleDatabase,
	dbQueue: DbQueue,
	deliverQueue: DeliverQueue,
): Promise<number> {
	const { rows, leaseToken } = await claimPublishedRows(db);
	await reconcilePublishedDeliveries(db, deliverQueue, {
		rows: rows.filter((row) => row.queue === QUEUE.DELIVER),
		leaseToken,
	});
	await reconcilePublishedDbExecutions(db, dbQueue, {
		rows: rows.filter((row) => row.queue === QUEUE.DB),
		leaseToken,
	});
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
			pending: sql<number>`count(*) FILTER (WHERE ${queueOutbox.state} NOT IN ('deadLetter', 'completed'))::integer`,
			deadLetter: sql<number>`count(*) FILTER (WHERE ${queueOutbox.state} = 'deadLetter')::integer`,
			deliveryFailed: sql<number>`count(*) FILTER (WHERE ${queueOutbox.deadLetterReason} = 'deliveryFailed')::integer`,
			invalidPayload: sql<number>`count(*) FILTER (WHERE ${queueOutbox.deadLetterReason} = 'invalidPayload')::integer`,
			// 生の sql`` で timestamptz を select すると drizzle のカラム変換を通らず文字列のまま返るため、
			// 経過時間の計算自体を SQL 側で済ませて double precision (= pg が number にパースする型) で受ける。
			oldestPendingAgeMs: sql<
				number | null
			>`(extract(epoch from (now() - min(${queueOutbox.createdAt}) FILTER (WHERE ${queueOutbox.state} NOT IN ('deadLetter', 'completed')))) * 1000)::double precision`,
		})
		.from(queueOutbox);
	if (stats == null) {
		throw new Error('Queue outbox aggregate query returned no rows');
	}

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
