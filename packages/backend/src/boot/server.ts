/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { serve } from 'bun';
import * as fs from 'node:fs';
import Logger from '@/logger.js';
import type { Config } from '@/config.js';
import { envOption } from '@/env.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createMisskeyApp } from '@/server/app.js';
import { createOAuthProviderRuntime } from '@/server/oauth/OAuthProviderRuntime.js';
import { createClientCommonDataLoader } from '@/server/web/client-common-data.js';
import type { StreamServerDependencies } from '@/server/streaming/runtime.js';
import { createBunNativeStreamRuntime } from '@/server/streaming/bun-native.js';
import { traceHttpRequest } from '@/telemetry.js';
import { startQueueStatsDaemon } from '@/server/daemons/queue-stats.js';
import { startServerStatsDaemon } from '@/server/daemons/server-stats.js';
import { createEventPublishers } from '@/server/rest/events.js';

export type ServerRuntime = {
	server: Bun.Server;
	dispose: () => Promise<void>;
};

type RuntimeDisposer = () => void | Promise<void>;

async function disposeServerRuntime(disposers: RuntimeDisposer[]): Promise<void> {
	const pending = disposers.splice(0).reverse();
	const errors: unknown[] = [];
	for (const dispose of pending) {
		try {
			// 解放順序は重要だが、各 disposer の実行は省略しない。
			// eslint-disable-next-line no-await-in-loop
			await dispose();
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0) {
		throw new AggregateError(errors, 'Server shutdown failed', { cause: errors[0] });
	}
}

export async function launchServer(
	config: Config,
	logger = new Logger('hono', 'cyan'),
	dependencies?: RuntimeDependencies,
	options?: { daemons?: boolean },
): Promise<ServerRuntime> {
	const deps = dependencies ?? (await createRuntimeDependencies(config));
	const disposers: RuntimeDisposer[] = dependencies == null ? [() => deps.dispose()] : [];
	try {
		return await launchServerWithDependencies(config, logger, deps, disposers, options?.daemons ?? false);
	} catch (error) {
		try {
			await disposeServerRuntime(disposers);
		} catch (cleanupError) {
			console.error('Failed to clean up Hono server resources after startup failed.', cleanupError);
		}
		throw error;
	}
}

async function launchServerWithDependencies(
	config: Config,
	logger: Logger,
	deps: Awaited<ReturnType<typeof createRuntimeDependencies>>,
	disposers: RuntimeDisposer[],
	daemons: boolean,
): Promise<ServerRuntime> {
	const eventPublishers = createEventPublishers({
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
		redis: deps.redis,
	});
	disposers.push(() => oauthRuntime.dispose());
	const app = createMisskeyApp({
		http: {
			config,
			meta: deps.meta,
			logger,
		},
		apiShell: {
			config,
			db: deps.db,
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
			notePostProcessing: deps.notePostProcessing,
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
	} satisfies StreamServerDependencies;

	// デーモンはホスト全体で1プロセスだけが持つ (master が cluster-roles.ts で割り当てる)。
	// 複数プロセスで動かすと同じ統計がプロセス数ぶん重複して全ストリームへ配信されてしまう。
	if (daemons && !envOption.noDaemons) {
		const queueStatsDaemon = startQueueStatsDaemon({
			config,
			deliverQueue: deps.deliverQueue,
			inboxQueue: deps.inboxQueue,
		});
		disposers.push(() => queueStatsDaemon.dispose());
		const serverStatsDaemon = startServerStatsDaemon({ meta: deps.meta });
		disposers.push(() => serverStatsDaemon.dispose());
	}

	const streamRuntime = createBunNativeStreamRuntime(streamDeps);
	disposers.push(() => streamRuntime.dispose());
	const listen = config.server.listen;
	const server = serve({
		...('unixSocket' in listen
			? { unix: listen.unixSocket.path }
			: { port: listen.tcp.port, hostname: listen.tcp.address }),
		// Bun のデフォルト上限は 128 MiB で、maxFileSize がそれを超える設定だとアップロードが
		// アプリ層に届く前に拒否される。ファイル本体 + multipart オーバーヘッドぶんを許容する
		// (エンドポイント毎の細かい上限は body-limit.ts が実バイト数で守る)。
		maxRequestBodySize: config.server.http.maximumRequestBodySizeBytes,
		fetch: (request, bunServerInstance) => {
			if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
				const url = new URL(request.url);
				if (url.pathname === streamRuntime.streamingPath) {
					return streamRuntime.tryUpgrade(request, url, bunServerInstance);
				}
			}

			// CPUプロファイル上は requestIP() が全体の 6.4% を占めるが、これを遅延化 (server を env で
			// 渡し getRequestIp() 側で解決) しても rps / CPU per req はどちらも変わらなかった。
			// 実コストは Bun の HTTP 層側にあり、ここを外しても消えない。
			const remoteAddress = bunServerInstance.requestIP(request)?.address;
			if (remoteAddress != null) {
				request.headers.set('x-misskey-remote-address', remoteAddress);
			}
			return traceHttpRequest(request, () => app.fetch(request));
		},
		websocket: streamRuntime.websocket,
	});
	disposers.push(async () => {
		const stopping = server.stop(false);
		try {
			// WS は終了し、HTTP の処理と応答が完了するまでは DB などの依存を保持する。
			streamRuntime.dispose();
		} finally {
			await stopping;
		}
	});

	if ('unixSocket' in listen && listen.unixSocket.permissions) {
		fs.chmodSync(listen.unixSocket.path, listen.unixSocket.permissions);
	}
	logger.info(
		'unixSocket' in listen
			? `Listening on ${listen.unixSocket.path}`
			: `Listening on ${listen.tcp.address}:${listen.tcp.port}`,
	);

	return {
		server,
		dispose: () => disposeServerRuntime(disposers),
	};
}
