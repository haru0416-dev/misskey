/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Server } from 'node:http';
import * as fs from 'node:fs';
import Logger from '@/logger.js';
import type { Config } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createMisskeyHonoApp } from '@/server/app.js';
import { createHonoNodeServer } from '@/server/node-server.js';
import { createOAuthProviderRuntime } from '@/server/oauth/OAuthProviderRuntime.js';
import { createClientCommonDataLoader } from '@/server/web/client-common-data.js';
import { attachHonoStreamServer, type HonoStreamServerDependencies } from '@/server/streaming/server.js';
import { createBunNativeStreamRuntime } from '@/server/streaming/bun-native.js';
import { startHonoQueueStatsDaemon } from '@/server/daemons/queue-stats.js';
import { startHonoServerStatsDaemon } from '@/server/daemons/server-stats.js';
import { createHonoEventPublishers } from '@/server/rest/events.js';

export type HonoServerRuntime = {
	server: Server | Bun.Server;
	deps: RuntimeDependencies;
	dispose: () => Promise<void>;
};

async function listen(server: Server, config: Config, logger: Logger): Promise<void> {
	if (config.socket) {
		if (fs.existsSync(config.socket)) {
			fs.unlinkSync(config.socket);
		}
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(config.socket, () => {
				server.off('error', reject);
				resolve();
			});
		});
		if (config.chmodSocket) {
			fs.chmodSync(config.socket, config.chmodSocket);
		}
		logger.info(`Listening on ${config.socket}`);
	} else {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(config.port, '0.0.0.0', () => {
				server.off('error', reject);
				resolve();
			});
		});
		logger.info(`Listening on port ${config.port}`);
	}
}

async function closeServer(server: Server): Promise<void> {
	if (!server.listening) return;

	await new Promise<void>((resolve, reject) => {
		server.close(err => err ? reject(err) : resolve());
	});
}

export async function launchHonoServer(config: Config, logger = new Logger('hono', 'cyan')): Promise<HonoServerRuntime> {
	const deps = await createRuntimeDependencies(config);
	const eventPublishers = createHonoEventPublishers({
		config,
		publish: (host, message) => deps.redisForPub.publish(host, message),
	});
	const oauthRuntime = createOAuthProviderRuntime({
		config,
		db: deps.db,
		httpRequestService: deps.httpRequestService,
		getCommonData: createClientCommonDataLoader({
			config,
			db: deps.db,
			meta: deps.meta,
		}),
		logger: deps.loggerService.getLogger('oauth'),
	});
	const app = createMisskeyHonoApp({
		http: {
			config,
			meta: deps.meta,
			logger,
		},
		apiShell: {
			config,
			db: deps.db,
			dbPool: deps.drizzlePool,
			meta: deps.meta,
			redis: deps.redis,
			redisForTimelines: deps.redisForTimelines,
			redisForReactions: deps.redisForReactions,
			downloadService: deps.downloadService,
			fileInfoService: deps.fileInfoService,
			httpRequestService: deps.httpRequestService,
			imageProcessingService: deps.imageProcessingService,
			internalStorageService: deps.internalStorageService,
			s3Service: deps.s3Service,
			userAuthService: deps.userAuthService,
			videoProcessingService: deps.videoProcessingService,
			webAuthnService: deps.webAuthnService,
			emailService: deps.emailService,
			chartWriters: deps.chartWriters,
			systemQueue: deps.systemQueue,
			endedPollNotificationQueue: deps.endedPollNotificationQueue,
			postScheduledNoteQueue: deps.postScheduledNoteQueue,
			deliverQueue: deps.deliverQueue,
			inboxQueue: deps.inboxQueue,
			dbQueue: deps.dbQueue,
			relationshipQueue: deps.relationshipQueue,
			objectStorageQueue: deps.objectStorageQueue,
			userWebhookDeliverQueue: deps.userWebhookDeliverQueue,
			systemWebhookDeliverQueue: deps.systemWebhookDeliverQueue,
			logger: deps.loggerService.getLogger('Signin'),
			...eventPublishers,
		},
		clientBase: {
			config,
			db: deps.db,
			meta: deps.meta,
		},
		file: {
			config,
			db: deps.db,
			fileInfoService: deps.fileInfoService,
			downloadService: deps.downloadService,
			imageProcessingService: deps.imageProcessingService,
			videoProcessingService: deps.videoProcessingService,
			internalStorageService: deps.internalStorageService,
			logger: deps.loggerService.getLogger('server', 'gray'),
		},
		feed: {
			config,
			db: deps.db,
			meta: deps.meta,
		},
		health: {
			redis: deps.redis,
			redisForPub: deps.redisForPub,
			redisForSub: deps.redisForSub,
			redisForTimelines: deps.redisForTimelines,
			redisForReactions: deps.redisForReactions,
			db: deps.db,
			meilisearch: deps.meilisearch,
		},
		nodeinfo: {
			config,
			db: deps.db,
			meta: deps.meta,
		},
		oauth: {
			runtime: oauthRuntime,
		},
		openApi: {
			config,
		},
		root: {
			config,
			db: deps.db,
			meta: deps.meta,
		},
		staticAssets: {
			config,
		},
		urlPreview: {
			urlPreviewService: deps.urlPreviewService,
		},
		webMetadata: {
			config,
			meta: deps.meta,
		},
		webUtility: {
			config,
			meta: deps.meta,
		},
		wellKnown: {
			config,
			db: deps.db,
			meta: deps.meta,
		},
		inbox: {
			config,
			meta: deps.meta,
			inboxQueue: deps.inboxQueue,
		},
		apObject: {
			config,
			db: deps.db,
			meta: deps.meta,
			redis: deps.redis,
			redisForTimelines: deps.redisForTimelines,
			deliverQueue: deps.deliverQueue,
			userWebhookDeliverQueue: deps.userWebhookDeliverQueue,
			httpRequestService: deps.httpRequestService,
			publishInternalEvent: eventPublishers.publishInternalEvent,
			publishMainStream: eventPublishers.publishMainStream,
		},
		clientPages: {
			config,
			db: deps.db,
			meta: deps.meta,
			redis: deps.redis,
			getCommonData: createClientCommonDataLoader({
				config,
				db: deps.db,
				meta: deps.meta,
			}),
		},
	});
	const streamDeps = {
		config,
		db: deps.db,
		redis: deps.redis,
		redisForSub: deps.redisForSub,
		meta: deps.meta,
		publishMainStream: eventPublishers.publishMainStream,
	} satisfies HonoStreamServerDependencies;

	const queueStatsDaemon = startHonoQueueStatsDaemon({
		config,
		deliverQueue: deps.deliverQueue,
		inboxQueue: deps.inboxQueue,
	});
	const serverStatsDaemon = startHonoServerStatsDaemon({ meta: deps.meta });

	let disposed = false;

	// bun ランタイムの node:http compat 層は 'upgrade' イベントで生ソケットに書き込むパターンだと
	// 同一プロセス内に他のソケット接続 (DB pool / ioredis 等) があるとレスポンスがクライアントに
	// 届かず永久にハングするバグがある (bun 1.3.14 で確認済み)。Bun.serve() のネイティブ websocket
	// API はこの経路を通らないため、bun 実行時のみこちらを使う。詳細は streaming/bun-native.ts 参照。
	if (typeof Bun !== 'undefined') {
		const streamRuntime = createBunNativeStreamRuntime(streamDeps);
		const bunServer = Bun.serve({
			...(config.socket ? { unix: config.socket } : { port: config.port, hostname: '0.0.0.0' }),
			// Bun のデフォルト上限は 128 MiB で、maxFileSize がそれを超える設定だとアップロードが
			// アプリ層に届く前に拒否される。ファイル本体 + multipart オーバーヘッドぶんを許容する
			// (エンドポイント毎の細かい上限は body-limit.ts が実バイト数で守る)。
			maxRequestBodySize: config.maxFileSize + 1024 * 1024,
			fetch: async (request, bunServerInstance) => {
				const url = new URL(request.url);
				if (url.pathname === streamRuntime.streamingPath && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
					return streamRuntime.tryUpgrade(request, url, bunServerInstance);
				}

				const remoteAddress = bunServerInstance.requestIP(request)?.address;
				if (remoteAddress != null && !request.headers.has('x-misskey-remote-address')) {
					request.headers.set('x-misskey-remote-address', remoteAddress);
				}
				return app.fetch(request);
			},
			websocket: streamRuntime.websocket,
		});

		if (config.socket && config.chmodSocket) {
			fs.chmodSync(config.socket, config.chmodSocket);
		}
		logger.info(config.socket ? `Listening on ${config.socket}` : `Listening on port ${config.port}`);

		return {
			server: bunServer,
			deps,
			dispose: async () => {
				if (disposed) return;
				disposed = true;
				oauthRuntime.dispose();
				serverStatsDaemon.dispose();
				queueStatsDaemon.dispose();
				await streamRuntime.dispose();
				await bunServer.stop(true);
				await deps.dispose();
			},
		};
	}

	const server = createHonoNodeServer({ app });
	const streamServer = attachHonoStreamServer(server, streamDeps);

	await listen(server, config, logger);

	return {
		server,
		deps,
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			oauthRuntime.dispose();
			serverStatsDaemon.dispose();
			queueStatsDaemon.dispose();
			await streamServer.detach();
			await closeServer(server);
			await deps.dispose();
		},
	};
}
