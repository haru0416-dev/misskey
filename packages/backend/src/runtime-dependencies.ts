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
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { AiService } from '@/core/AiService.js';
import { DownloadService } from '@/core/DownloadService.js';
import { FileInfoService } from '@/core/FileInfoService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { ImageProcessingService } from '@/core/ImageProcessingService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { EmailService } from '@/core/EmailService.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { WebAuthnService } from '@/core/WebAuthnService.js';
import { createDeliverQueue, createSystemWebhookDeliverQueue, type DeliverQueue, type SystemWebhookDeliverQueue } from '@/core/QueueModule.js';
import { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { UrlPreviewService } from '@/server/web/UrlPreviewService.js';

export type RuntimeDependencies = {
	config: Config;
	drizzlePool: MiDrizzlePool;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	meilisearch: Meilisearch | null;
	aiService: AiService;
	downloadService: DownloadService;
	emailService: EmailService;
	fileInfoService: FileInfoService;
	httpRequestService: HttpRequestService;
	imageProcessingService: ImageProcessingService;
	internalStorageService: InternalStorageService;
	loggerService: LoggerService;
	userAuthService: UserAuthService;
	utilityService: UtilityService;
	urlPreviewService: UrlPreviewService;
	videoProcessingService: VideoProcessingService;
	webAuthnService: WebAuthnService;
	deliverQueue: DeliverQueue;
	systemWebhookDeliverQueue: SystemWebhookDeliverQueue;
	redis: Redis.Redis;
	redisForPub: Redis.Redis;
	redisForSub: Redis.Redis;
	redisForTimelines: Redis.Redis;
	redisForReactions: Redis.Redis;
	dispose: () => Promise<void>;
};

export type RuntimeResources = {
	drizzlePool: MiDrizzlePool;
	redis: Redis.Redis;
	redisForPub: Redis.Redis;
	redisForSub: Redis.Redis;
	redisForTimelines: Redis.Redis;
	redisForReactions: Redis.Redis;
	deliverQueue?: DeliverQueue;
	systemWebhookDeliverQueue?: SystemWebhookDeliverQueue;
};

export function createMeilisearchClient(config: Config): Meilisearch | null {
	if (config.fulltextSearch?.provider !== 'meilisearch') {
		return null;
	}

	if (!config.meilisearch) {
		throw new Error('Meilisearch is enabled but no configuration is provided');
	}

	return new Meilisearch({
		host: `${config.meilisearch.ssl ? 'https' : 'http'}://${config.meilisearch.host}:${config.meilisearch.port}`,
		apiKey: config.meilisearch.apiKey,
	});
}

export function createRedisClient(config: Config): Redis.Redis {
	return new Redis.Redis(config.redis);
}

export function createRedisForPub(config: Config): Redis.Redis {
	return new Redis.Redis(config.redisForPubsub);
}

export async function createRedisForSub(config: Config): Promise<Redis.Redis> {
	const redis = new Redis.Redis(config.redisForPubsub);
	await redis.subscribe(config.host);
	return redis;
}

export function createRedisForTimelines(config: Config): Redis.Redis {
	return new Redis.Redis(config.redisForTimelines);
}

export function createRedisForReactions(config: Config): Redis.Redis {
	return new Redis.Redis(config.redisForReactions);
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
						(meta as any)[key] = (body.after as any)[key];
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
	await allSettled();
	await Promise.all([
		resources.deliverQueue?.close(),
		resources.systemWebhookDeliverQueue?.close(),
		resources.drizzlePool.end(),
		closeRedisConnection(resources.redis),
		closeRedisConnection(resources.redisForPub),
		closeRedisConnection(resources.redisForSub),
		closeRedisConnection(resources.redisForTimelines),
		closeRedisConnection(resources.redisForReactions),
	]);
}

export async function createRuntimeDependencies(config: Config): Promise<RuntimeDependencies> {
	const drizzlePool = createDrizzlePool(config);
	const db = createDrizzleDatabase(drizzlePool, config);
	const redis = createRedisClient(config);
	const redisForPub = createRedisForPub(config);
	const redisForSub = await createRedisForSub(config);
	const redisForTimelines = createRedisForTimelines(config);
	const redisForReactions = createRedisForReactions(config);
	const deliverQueue = createDeliverQueue(config);
	const systemWebhookDeliverQueue = createSystemWebhookDeliverQueue(config);
	const meilisearch = createMeilisearchClient(config);
	const meta = await fetchReactiveMeta(db, redisForSub);
	const loggerService = new LoggerService();
	const httpRequestService = new HttpRequestService(config);
	const aiService = new AiService(meta, httpRequestService, loggerService);
	const fileInfoService = new FileInfoService(aiService, loggerService);
	const downloadService = new DownloadService(config, httpRequestService, loggerService);
	const urlPreviewService = new UrlPreviewService(config, meta, httpRequestService, loggerService);
	const imageProcessingService = new ImageProcessingService();
	const videoProcessingService = new VideoProcessingService(config, imageProcessingService);
	const internalStorageService = new InternalStorageService(config);
	const utilityService = new UtilityService(config, meta);
	const emailService = new EmailService(config, meta, db, loggerService, utilityService, httpRequestService);
	const userAuthService = new UserAuthService(redis, db);
	const webAuthnService = new WebAuthnService(config, meta, redis, db);

	return {
		config,
		drizzlePool,
		db,
		meta,
		meilisearch,
		aiService,
		downloadService,
		emailService,
		fileInfoService,
		httpRequestService,
		imageProcessingService,
		internalStorageService,
		loggerService,
		userAuthService,
		utilityService,
		urlPreviewService,
		videoProcessingService,
		webAuthnService,
		deliverQueue,
		systemWebhookDeliverQueue,
		redis,
		redisForPub,
		redisForSub,
		redisForTimelines,
		redisForReactions,
		dispose: async () => {
			await disposeRuntimeResources({ drizzlePool, redis, redisForPub, redisForSub, redisForTimelines, redisForReactions, deliverQueue, systemWebhookDeliverQueue });
		},
	};
}
