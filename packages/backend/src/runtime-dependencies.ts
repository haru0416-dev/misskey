/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Meilisearch } from 'meilisearch';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import { allSettled } from '@/misc/promise-tracker.js';
import type { GlobalEvents } from '@/core/global-events.js';
import { createAiService } from '@/core/AiService.js';
import { createDownloadService, type DownloadService } from '@/core/DownloadService.js';
import { createFileInfoService, type FileInfoService } from '@/core/FileInfoService.js';
import { createHttpRequestService, type HttpRequestService } from '@/core/HttpRequestService.js';
import { createImageProcessingService, type ImageProcessingService } from '@/core/ImageProcessingService.js';
import { createInternalStorageService, type InternalStorageService } from '@/core/InternalStorageService.js';
import { createLoggerService, type LoggerService } from '@/core/LoggerService.js';
import { createS3Service, type S3Service } from '@/core/S3Service.js';
import { createEmailService, type EmailService } from '@/core/EmailService.js';
import { createUserAuthService, type UserAuthService } from '@/core/UserAuthService.js';
import { createUtilityService } from '@/core/UtilityService.js';
import { createWebAuthnService, type WebAuthnService } from '@/core/WebAuthnService.js';
import {
	createDbQueue,
	createDeliverQueue,
	createEndedPollNotificationQueue,
	createInboxQueue,
	createObjectStorageQueue,
	createPostScheduledNoteQueue,
	createRelationshipQueue,
	createSystemQueue,
	createSystemWebhookDeliverQueue,
	createUserWebhookDeliverQueue,
	type DbQueue,
	type DeliverQueue,
	type EndedPollNotificationQueue,
	type InboxQueue,
	type ObjectStorageQueue,
	type PostScheduledNoteQueue,
	type RelationshipQueue,
	type SystemQueue,
	type SystemWebhookDeliverQueue,
	type UserWebhookDeliverQueue,
} from '@/core/queues.js';
import { createVideoProcessingService, type VideoProcessingService } from '@/core/VideoProcessingService.js';
import { createUrlPreviewService, type UrlPreviewService } from '@/server/web/UrlPreviewService.js';
import { createHonoChartWriters, saveHonoChartWriters, startHonoChartWriterSaveInterval, type HonoChartWriters } from '@/server/chart-runtime.js';

export type RuntimeDependencies = {
	config: Config;
	drizzlePool: MiDrizzlePool;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	meilisearch: Meilisearch | null;
	downloadService: DownloadService;
	emailService: EmailService;
	fileInfoService: FileInfoService;
	httpRequestService: HttpRequestService;
	imageProcessingService: ImageProcessingService;
	internalStorageService: InternalStorageService;
	loggerService: LoggerService;
	s3Service: S3Service;
	userAuthService: UserAuthService;
	urlPreviewService: UrlPreviewService;
	videoProcessingService: VideoProcessingService;
	webAuthnService: WebAuthnService;
	systemQueue: SystemQueue;
	endedPollNotificationQueue: EndedPollNotificationQueue;
	postScheduledNoteQueue: PostScheduledNoteQueue;
	deliverQueue: DeliverQueue;
	inboxQueue: InboxQueue;
	dbQueue: DbQueue;
	relationshipQueue: RelationshipQueue;
	objectStorageQueue: ObjectStorageQueue;
	userWebhookDeliverQueue: UserWebhookDeliverQueue;
	systemWebhookDeliverQueue: SystemWebhookDeliverQueue;
	redis: Redis.Redis;
	redisForPub: Redis.Redis;
	redisForSub: Redis.Redis;
	redisForTimelines: Redis.Redis;
	redisForReactions: Redis.Redis;
	chartWriters: HonoChartWriters;
	dispose: () => Promise<void>;
};

export type RuntimeResources = {
	drizzlePool?: MiDrizzlePool;
	redis?: Redis.Redis;
	redisForPub?: Redis.Redis;
	redisForSub?: Redis.Redis;
	redisForTimelines?: Redis.Redis;
	redisForReactions?: Redis.Redis;
	systemQueue?: SystemQueue;
	endedPollNotificationQueue?: EndedPollNotificationQueue;
	postScheduledNoteQueue?: PostScheduledNoteQueue;
	deliverQueue?: DeliverQueue;
	inboxQueue?: InboxQueue;
	dbQueue?: DbQueue;
	relationshipQueue?: RelationshipQueue;
	objectStorageQueue?: ObjectStorageQueue;
	userWebhookDeliverQueue?: UserWebhookDeliverQueue;
	systemWebhookDeliverQueue?: SystemWebhookDeliverQueue;
	urlPreviewService?: UrlPreviewService;
};

export function createMeilisearchClient(config: Config): Meilisearch | null {
	if (config.search.provider !== 'meilisearch') {
		return null;
	}

	if (!config.search.meilisearch) {
		throw new Error('Meilisearch is enabled but no configuration is provided');
	}

	return new Meilisearch({
		host: config.search.meilisearch.endpoint,
		apiKey: config.search.meilisearch.apiKey,
	});
}

export function createRedisClient(config: Config): Redis.Redis {
	return new Redis.Redis(config.valkey.primary);
}

export function createRedisForPub(config: Config): Redis.Redis {
	return new Redis.Redis(config.valkey.pubsub);
}

export async function createRedisForSub(config: Config): Promise<Redis.Redis> {
	const redis = new Redis.Redis(config.valkey.pubsub);
	try {
		await redis.subscribe(config.runtime.host);
		return redis;
	} catch (error) {
		await closeRedisConnection(redis);
		throw error;
	}
}

export function createRedisForTimelines(config: Config): Redis.Redis {
	return new Redis.Redis(config.valkey.timelines);
}

export function createRedisForReactions(config: Config): Redis.Redis {
	return new Redis.Redis(config.valkey.reactions);
}

export async function fetchReactiveMeta(db: MiDrizzleDatabase, redisForSub: Redis.Redis): Promise<MiMeta> {
	const meta = await fetchMetaFromDatabase(db);

	async function onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'metaUpdated': {
					for (const key in body.after) {
						(meta as unknown as Record<string, unknown>)[key] = (body.after as unknown as Record<string, unknown>)[key];
					}
					meta.rootUser = null;
					break;
				}
				default:
					break;
			}
		}
	}

	redisForSub.on('message', onMessage);

	return meta;
}

export async function closeRedisConnection(redis: Redis.Redis): Promise<void> {
	try {
		await redis.quit();
	} catch {
		redis.disconnect();
	}
}

export async function disposeRuntimeResources(resources: RuntimeResources): Promise<void> {
	resources.urlPreviewService?.dispose();
	await allSettled();
	await Promise.all([
		resources.systemQueue?.close(),
		resources.endedPollNotificationQueue?.close(),
		resources.postScheduledNoteQueue?.close(),
		resources.deliverQueue?.close(),
		resources.inboxQueue?.close(),
		resources.dbQueue?.close(),
		resources.relationshipQueue?.close(),
		resources.objectStorageQueue?.close(),
		resources.userWebhookDeliverQueue?.close(),
		resources.systemWebhookDeliverQueue?.close(),
		resources.drizzlePool?.end(),
		resources.redis ? closeRedisConnection(resources.redis) : undefined,
		resources.redisForPub ? closeRedisConnection(resources.redisForPub) : undefined,
		resources.redisForSub ? closeRedisConnection(resources.redisForSub) : undefined,
		resources.redisForTimelines ? closeRedisConnection(resources.redisForTimelines) : undefined,
		resources.redisForReactions ? closeRedisConnection(resources.redisForReactions) : undefined,
	]);
}

export async function createRuntimeDependencies(config: Config): Promise<RuntimeDependencies> {
	const resources: RuntimeResources = {};
	try {
		const drizzlePool = resources.drizzlePool = createDrizzlePool(config);
		const db = createDrizzleDatabase(drizzlePool, config);
		const redis = resources.redis = createRedisClient(config);
		const redisForPub = resources.redisForPub = createRedisForPub(config);
		const redisForSub = resources.redisForSub = await createRedisForSub(config);
		const redisForTimelines = resources.redisForTimelines = createRedisForTimelines(config);
		const redisForReactions = resources.redisForReactions = createRedisForReactions(config);
		const systemQueue = resources.systemQueue = createSystemQueue(config);
		const endedPollNotificationQueue = resources.endedPollNotificationQueue = createEndedPollNotificationQueue(config);
		const postScheduledNoteQueue = resources.postScheduledNoteQueue = createPostScheduledNoteQueue(config);
		const deliverQueue = resources.deliverQueue = createDeliverQueue(config);
		const inboxQueue = resources.inboxQueue = createInboxQueue(config);
		const dbQueue = resources.dbQueue = createDbQueue(config);
		const relationshipQueue = resources.relationshipQueue = createRelationshipQueue(config);
		const objectStorageQueue = resources.objectStorageQueue = createObjectStorageQueue(config);
		const userWebhookDeliverQueue = resources.userWebhookDeliverQueue = createUserWebhookDeliverQueue(config);
		const systemWebhookDeliverQueue = resources.systemWebhookDeliverQueue = createSystemWebhookDeliverQueue(config);
		const meilisearch = createMeilisearchClient(config);
		const meta = await fetchReactiveMeta(db, redisForSub);
		const loggerService = createLoggerService();
		const httpRequestService = createHttpRequestService(config);
		const aiService = createAiService(meta, httpRequestService, loggerService);
		const fileInfoService = createFileInfoService(aiService, loggerService);
		const downloadService = createDownloadService(config, httpRequestService, loggerService);
		const urlPreviewService = resources.urlPreviewService = createUrlPreviewService(config, meta, httpRequestService, loggerService);
		const imageProcessingService = createImageProcessingService();
		const videoProcessingService = createVideoProcessingService(config, imageProcessingService);
		const internalStorageService = createInternalStorageService(config);
		const s3Service = createS3Service(httpRequestService);
		const utilityService = createUtilityService(config, meta);
		const emailService = createEmailService(config, meta, db, loggerService, utilityService, httpRequestService);
		const userAuthService = createUserAuthService(redis, db);
		const webAuthnService = createWebAuthnService(config, meta, redis, db);
		const chartWriters = createHonoChartWriters({ db, redis, meta, logger: loggerService.getLogger('chart', 'white') });
		const chartWriterSaveIntervalId = startHonoChartWriterSaveInterval(chartWriters);
		let disposed = false;

		return {
		config,
		drizzlePool,
		db,
		meta,
		meilisearch,
		downloadService,
		emailService,
		fileInfoService,
		httpRequestService,
		imageProcessingService,
		internalStorageService,
		loggerService,
		s3Service,
		userAuthService,
		urlPreviewService,
		videoProcessingService,
		webAuthnService,
		systemQueue,
		endedPollNotificationQueue,
		postScheduledNoteQueue,
		deliverQueue,
		inboxQueue,
		dbQueue,
		relationshipQueue,
		objectStorageQueue,
		userWebhookDeliverQueue,
		systemWebhookDeliverQueue,
		redis,
		redisForPub,
		redisForSub,
		redisForTimelines,
		redisForReactions,
		chartWriters,
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			clearInterval(chartWriterSaveIntervalId);
			try {
				if (process.env['NODE_ENV'] !== 'test') {
					await saveHonoChartWriters(chartWriters);
				}
			} finally {
				await disposeRuntimeResources(resources);
			}
		},
		};
	} catch (error) {
		await disposeRuntimeResources(resources);
		throw error;
	}
}
