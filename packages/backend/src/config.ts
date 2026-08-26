/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { RedisOptions } from 'ioredis';
import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';
import { PRODUCT_NAME } from '@/const.js';
import { optionalProperty } from '@/misc/optional-property.js';
import {
	compiledConfigEnvelopeSchema,
	parseByteSize,
	parseDuration,
	type CompiledConfigV2,
	type SecretSource,
} from './config-schema.js';

export type TelemetryInstrumentationName = keyof InstrumentationConfigMap;

const TELEMETRY_INSTRUMENTATION_NAMES = new Set<string>([
	'@opentelemetry/instrumentation-amqplib',
	'@opentelemetry/instrumentation-aws-lambda',
	'@opentelemetry/instrumentation-aws-sdk',
	'@opentelemetry/instrumentation-bunyan',
	'@opentelemetry/instrumentation-cassandra-driver',
	'@opentelemetry/instrumentation-connect',
	'@opentelemetry/instrumentation-cucumber',
	'@opentelemetry/instrumentation-dataloader',
	'@opentelemetry/instrumentation-dns',
	'@opentelemetry/instrumentation-express',
	'@opentelemetry/instrumentation-fs',
	'@opentelemetry/instrumentation-generic-pool',
	'@opentelemetry/instrumentation-graphql',
	'@opentelemetry/instrumentation-grpc',
	'@opentelemetry/instrumentation-hapi',
	'@opentelemetry/instrumentation-host-metrics',
	'@opentelemetry/instrumentation-http',
	'@opentelemetry/instrumentation-ioredis',
	'@opentelemetry/instrumentation-kafkajs',
	'@opentelemetry/instrumentation-knex',
	'@opentelemetry/instrumentation-koa',
	'@opentelemetry/instrumentation-lru-memoizer',
	'@opentelemetry/instrumentation-memcached',
	'@opentelemetry/instrumentation-mongodb',
	'@opentelemetry/instrumentation-mongoose',
	'@opentelemetry/instrumentation-mysql',
	'@opentelemetry/instrumentation-mysql2',
	'@opentelemetry/instrumentation-nestjs-core',
	'@opentelemetry/instrumentation-net',
	'@opentelemetry/instrumentation-openai',
	'@opentelemetry/instrumentation-oracledb',
	'@opentelemetry/instrumentation-pg',
	'@opentelemetry/instrumentation-pino',
	'@opentelemetry/instrumentation-redis',
	'@opentelemetry/instrumentation-restify',
	'@opentelemetry/instrumentation-router',
	'@opentelemetry/instrumentation-runtime-node',
	'@opentelemetry/instrumentation-socket.io',
	'@opentelemetry/instrumentation-tedious',
	'@opentelemetry/instrumentation-undici',
	'@opentelemetry/instrumentation-winston',
]);

export type TelemetryConfig = {
	endpoint: string;
	headers?: Record<string, string>;
	serviceName?: string;
	tracesSampleRatio?: number;
	tracePropagationTargets?: string[];
	disabledInstrumentations?: TelemetryInstrumentationName[];
};

export type FrontendTelemetryConfig = {
	endpoint: string;
	serviceName?: string;
	tracesSampleRatio?: number;
	propagateTraceHeaderCorsUrls?: string[];
};

// ioredis 6 の Redis は ReplyMapping をクラスの型引数に取り、コンストラクタは
// `RedisOptions & { replyMapping?: ReplyMapping }` (既定 "legacy") を要求する。
// RedisOptions.replyMapping は "legacy" | "resp3" なので、この型の変数をそのまま
// 渡すと型引数を推論できず全 overload が外れる。設定側では指定しないので型から除く。
export type RuntimeValkeyConnection = Omit<RedisOptions, 'replyMapping'> & {
	host: string;
	port: number;
	prefix: string;
	keyPrefix: string;
};

type QueueConfig = {
	concurrencyPerWorker: number;
	maximumStartsPerSecond?: number;
	maximumAttempts?: number;
};

export type Config = {
	configVersion: 2;
	instance: {
		url: string;
		setupPassword?: string;
		publishSourceTarball: boolean;
	};
	server: {
		listen: { tcp: { address: string; port: number } } | { unixSocket: { path: string; permissions?: string } };
		reverseProxy: { trustedNetworks: string[] };
		http: {
			maximumRequestBodySizeBytes: number;
			gracefulShutdownTimeoutMs: number;
			hsts: boolean;
			ipRateLimit: boolean;
		};
		process: {
			httpWorkers: number;
			queueWorkers: number;
			computationThreadsPerWorker: number;
			pidFile: string;
		};
	};
	database: {
		primary: {
			host: string;
			port: number;
			name: string;
			user: string;
			password: string;
			ssl?: boolean;
		};
		pool: {
			minimumConnections: number;
			maximumConnectionsPerHost: number;
			connectionTimeoutMs: number;
			idleConnectionTimeoutMs: number;
			statementTimeoutMs: number;
		};
	};
	valkey: {
		primary: RuntimeValkeyConnection;
		pubsub: RuntimeValkeyConnection;
		jobQueue: RuntimeValkeyConnection;
		timelines: RuntimeValkeyConnection;
		reactions: RuntimeValkeyConnection;
	};
	search: {
		provider: 'sqlLike' | 'sqlPgroonga' | 'meilisearch';
		meilisearch?: {
			endpoint: string;
			apiKey: string;
			index: string;
			scope: 'local' | 'global' | string[];
		};
	};
	outboundNetwork: {
		bindAddress?: string;
		addressFamily: 'ipv4' | 'ipv6' | 'dualStack';
		proxy: { url?: string; smtpUrl?: string; bypassHosts: string[] };
		http: {
			connectionTimeoutMs: number;
			requestTimeoutMs: number;
			maximumResponseSizeBytes: number;
			maximumSockets: number;
			maximumFreeSockets: number;
			keepAliveDurationMs: number;
			maximumRedirects: number;
		};
		dnsCache: { successTtlSeconds: number; failureTtlSeconds: number };
		privateNetworkAccess: { allowedNetworks: string[] };
	};
	media: {
		proxyUrl: string;
		externalProxyEnabled: boolean;
		videoThumbnailGeneratorUrl: string | null;
	};
	limits: {
		maximumFileSizeBytes: number;
		channelTimelineNotes: number;
		userNotifications: number;
	};
	maintenance: { antennaInactiveAfterMs: number };
	queues: {
		deliver: QueueConfig;
		inbox: QueueConfig;
		relationships: QueueConfig;
		database: QueueConfig;
		system: QueueConfig;
		objectStorage: QueueConfig;
		userWebhooks: QueueConfig;
		systemWebhooks: QueueConfig;
		backoff: { initialDelayMs: number; maximumDelayMs: number; jitterRatio: number };
		retention: {
			completedMaximumAgeSeconds: number;
			completedMaximumCount: number;
			failedMaximumAgeSeconds: number;
			failedMaximumCount: number;
		};
	};
	observability: {
		logging: {
			level: 'debug' | 'info' | 'warning' | 'error';
			format: 'pretty' | 'json';
			includeTimestamp: boolean;
			sql: { enabled: boolean; logParameters: boolean; maximumQueryLength: number };
		};
		telemetry: { backend?: TelemetryConfig; frontend?: FrontendTelemetryConfig };
	};
	runtime: {
		version: string;
		host: string;
		hostname: string;
		apiUrl: string;
		authUrl: string;
		userAgent: string;
		frontendManifestExists: boolean;
		frontendEmbedManifestExists: boolean;
		rootDir: string;
	};
};

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

let rootDir = _dirname;
while (!fs.existsSync(resolve(rootDir, 'packages'))) {
	const parentDir = dirname(rootDir);
	if (parentDir === rootDir) throw new Error('Cannot find root directory');
	rootDir = parentDir;
}

const projectBuiltDir = resolve(rootDir, 'built');
const compiledConfigFilePathForTest = resolve(projectBuiltDir, '._config_.json');

export const compiledConfigFilePath = fs.existsSync(compiledConfigFilePathForTest)
	? compiledConfigFilePathForTest
	: resolve(projectBuiltDir, '.config.json');

function resolveSecret(secret: SecretSource, path: string): string {
	if ('plainText' in secret) return secret.plainText;
	const value = process.env[secret.fromEnvironment];
	if (value == null) throw new Error(`${path} requires environment variable ${secret.fromEnvironment}.`);
	return value;
}

function normalizeUrl(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

function resolveValkeyConnection(config: CompiledConfigV2, name: string, host: string): RuntimeValkeyConnection {
	const source = config.valkey.connections[name];
	if (source == null) throw new Error(`Unknown Valkey connection: ${name}`);
	const prefix = source.keyPrefix ?? host;
	return {
		host: source.host,
		port: source.port,
		username: source.username,
		password:
			source.password == null ? undefined : resolveSecret(source.password, `valkey.connections.${name}.password`),
		db: source.database,
		prefix,
		keyPrefix: `${prefix}:`,
		family: source.addressFamily === 'ipv4' ? 4 : source.addressFamily === 'ipv6' ? 6 : 0,
		connectTimeout: parseDuration(source.connectionTimeout),
		commandTimeout: parseDuration(source.commandTimeout),
		...(source.tls ? { tls: {} } : {}),
	};
}

function resolveTelemetryInstrumentations(
	names: readonly string[] | undefined,
): TelemetryInstrumentationName[] | undefined {
	return names?.map((name, index) => {
		if (!TELEMETRY_INSTRUMENTATION_NAMES.has(name)) {
			throw new Error(`observability.telemetry.backend.disabledInstrumentations[${index}] is not supported.`);
		}
		return name as TelemetryInstrumentationName;
	});
}

function resolveTelemetryBackend(
	backend: CompiledConfigV2['observability']['telemetry']['backend'],
): Config['observability']['telemetry']['backend'] {
	if (backend == null) return undefined;
	return {
		endpoint: backend.endpoint,
		...optionalProperty('serviceName', backend.serviceName),
		...optionalProperty('tracesSampleRatio', backend.tracesSampleRatio),
		...optionalProperty('tracePropagationTargets', backend.tracePropagationTargets),
		...optionalProperty(
			'headers',
			backend.headers == null
				? undefined
				: Object.fromEntries(
						Object.entries(backend.headers).map(([name, value]) => [
							name,
							resolveSecret(value, `observability.telemetry.backend.headers.${name}`),
						]),
					),
		),
		...optionalProperty('disabledInstrumentations', resolveTelemetryInstrumentations(backend.disabledInstrumentations)),
	};
}

function resolveTelemetryFrontend(
	frontend: CompiledConfigV2['observability']['telemetry']['frontend'],
): Config['observability']['telemetry']['frontend'] {
	if (frontend == null) return undefined;
	return {
		endpoint: frontend.endpoint,
		...optionalProperty('serviceName', frontend.serviceName),
		...optionalProperty('tracesSampleRatio', frontend.tracesSampleRatio),
		...optionalProperty('propagateTraceHeaderCorsUrls', frontend.propagateTraceHeaderCorsUrls),
	};
}

function resolveTelemetry(config: CompiledConfigV2): Config['observability']['telemetry'] {
	return {
		...optionalProperty('backend', resolveTelemetryBackend(config.observability.telemetry.backend)),
		...optionalProperty('frontend', resolveTelemetryFrontend(config.observability.telemetry.frontend)),
	};
}

/** キュー既定値の穴埋め。未指定の起動レートと再試行回数はキューごとに異なる。 */
function resolveQueues(queues: CompiledConfigV2['queues']): Config['queues'] {
	const withDefaults = <K extends keyof CompiledConfigV2['queues']>(
		name: K,
		startsPerSecond: number,
		attempts?: number,
	) => {
		const queue = queues[name] as QueueConfig;
		return {
			...queue,
			maximumStartsPerSecond: queue.maximumStartsPerSecond ?? startsPerSecond,
			...(attempts == null ? {} : { maximumAttempts: queue.maximumAttempts ?? attempts }),
		};
	};

	return {
		deliver: withDefaults('deliver', 128, 12),
		inbox: withDefaults('inbox', 32, 8),
		relationships: withDefaults('relationships', 64),
		database: queues.database,
		system: queues.system,
		objectStorage: queues.objectStorage,
		// webhook 系は既定の起動レートを持たず、ワーカーあたりの同時実行数をそのまま上限にする
		userWebhooks: withDefaults('userWebhooks', queues.userWebhooks.concurrencyPerWorker),
		systemWebhooks: withDefaults('systemWebhooks', queues.systemWebhooks.concurrencyPerWorker),
		backoff: {
			initialDelayMs: parseDuration(queues.backoff.initialDelay),
			maximumDelayMs: parseDuration(queues.backoff.maximumDelay),
			jitterRatio: queues.backoff.jitterRatio,
		},
		retention: {
			completedMaximumAgeSeconds: parseDuration(queues.retention.completedMaximumAge) / 1000,
			completedMaximumCount: queues.retention.completedMaximumCount,
			failedMaximumAgeSeconds: parseDuration(queues.retention.failedMaximumAge) / 1000,
			failedMaximumCount: queues.retention.failedMaximumCount,
		},
	} as Config['queues'];
}

function resolveListen(listen: CompiledConfigV2['server']['listen']): Config['server']['listen'] {
	if ('tcp' in listen) return listen;
	return {
		unixSocket: {
			path: listen.unixSocket.path,
			...optionalProperty('permissions', listen.unixSocket.permissions),
		},
	};
}

export function materializeConfig(source: CompiledConfigV2, meta: { version: string }): Config {
	const instanceUrl = new URL(source.instance.url);
	const url = instanceUrl.origin;
	const maximumRequestBodySizeBytes = parseByteSize(source.server.http.maximumRequestBodySize);
	const maximumFileSizeBytes = parseByteSize(source.limits.maximumFileSize);
	if (maximumRequestBodySizeBytes < maximumFileSizeBytes + 1024 * 1024) {
		throw new Error(
			'server.http.maximumRequestBodySize must allow maximumFileSize plus at least 1MiB of multipart overhead.',
		);
	}
	const internalMediaProxy = `${url}/proxy`;
	const externalMediaProxy = source.media.externalProxyUrl == null ? null : normalizeUrl(source.media.externalProxyUrl);
	const connections = source.valkey.assignments;
	const primary = resolveValkeyConnection(source, 'primary', instanceUrl.host);
	const meilisearch =
		source.search.provider === 'meilisearch'
			? {
					endpoint: normalizeUrl(source.search.meilisearch.endpoint),
					apiKey: resolveSecret(source.search.meilisearch.apiKey, 'search.meilisearch.apiKey'),
					index: source.search.meilisearch.index,
					scope: source.search.meilisearch.scope,
				}
			: undefined;

	return {
		configVersion: 2,
		instance: {
			url,
			...(source.instance.setupPassword == null
				? {}
				: { setupPassword: resolveSecret(source.instance.setupPassword, 'instance.setupPassword') }),
			publishSourceTarball: source.instance.publishSourceTarball,
		},
		server: {
			listen: resolveListen(source.server.listen),
			reverseProxy: source.server.reverseProxy,
			http: {
				maximumRequestBodySizeBytes,
				gracefulShutdownTimeoutMs: parseDuration(source.server.http.gracefulShutdownTimeout),
				hsts: source.server.http.hsts,
				ipRateLimit: source.server.http.ipRateLimit,
			},
			process: source.server.process,
		},
		database: {
			primary: {
				host: source.database.primary.host,
				port: source.database.primary.port,
				name: source.database.primary.name,
				user: source.database.primary.user,
				password: resolveSecret(source.database.primary.password, 'database.primary.password'),
				...optionalProperty('ssl', source.database.primary.ssl),
			},
			pool: {
				minimumConnections: source.database.pool.minimumConnections,
				maximumConnectionsPerHost: source.database.pool.maximumConnectionsPerHost,
				connectionTimeoutMs: parseDuration(source.database.pool.connectionTimeout),
				idleConnectionTimeoutMs: parseDuration(source.database.pool.idleConnectionTimeout),
				statementTimeoutMs: parseDuration(source.database.pool.statementTimeout),
			},
		},
		valkey: {
			primary,
			pubsub:
				connections.pubsub === 'primary'
					? primary
					: resolveValkeyConnection(source, connections.pubsub, instanceUrl.host),
			jobQueue:
				connections.jobQueue === 'primary'
					? primary
					: resolveValkeyConnection(source, connections.jobQueue, instanceUrl.host),
			timelines:
				connections.timelines === 'primary'
					? primary
					: resolveValkeyConnection(source, connections.timelines, instanceUrl.host),
			reactions:
				connections.reactions === 'primary'
					? primary
					: resolveValkeyConnection(source, connections.reactions, instanceUrl.host),
		},
		search: {
			provider: source.search.provider,
			...optionalProperty('meilisearch', meilisearch),
		},
		outboundNetwork: {
			...optionalProperty('bindAddress', source.outboundNetwork.bindAddress),
			addressFamily: source.outboundNetwork.addressFamily,
			proxy: {
				...optionalProperty('url', source.outboundNetwork.proxy.url),
				...optionalProperty('smtpUrl', source.outboundNetwork.proxy.smtpUrl),
				bypassHosts: source.outboundNetwork.proxy.bypassHosts,
			},
			http: {
				connectionTimeoutMs: parseDuration(source.outboundNetwork.http.connectionTimeout),
				requestTimeoutMs: parseDuration(source.outboundNetwork.http.requestTimeout),
				maximumResponseSizeBytes: parseByteSize(source.outboundNetwork.http.maximumResponseSize),
				maximumSockets: source.outboundNetwork.http.maximumSockets,
				maximumFreeSockets: source.outboundNetwork.http.maximumFreeSockets,
				keepAliveDurationMs: parseDuration(source.outboundNetwork.http.keepAliveDuration),
				maximumRedirects: source.outboundNetwork.http.maximumRedirects,
			},
			dnsCache: {
				successTtlSeconds: parseDuration(source.outboundNetwork.dnsCache.successTtl) / 1000,
				failureTtlSeconds: parseDuration(source.outboundNetwork.dnsCache.failureTtl) / 1000,
			},
			privateNetworkAccess: source.outboundNetwork.privateNetworkAccess,
		},
		media: {
			proxyUrl: externalMediaProxy ?? internalMediaProxy,
			externalProxyEnabled: externalMediaProxy != null && externalMediaProxy !== internalMediaProxy,
			videoThumbnailGeneratorUrl:
				source.media.videoThumbnailGeneratorUrl == null ? null : normalizeUrl(source.media.videoThumbnailGeneratorUrl),
		},
		limits: {
			maximumFileSizeBytes,
			channelTimelineNotes: source.limits.channelTimelineNotes,
			userNotifications: source.limits.userNotifications,
		},
		maintenance: { antennaInactiveAfterMs: parseDuration(source.maintenance.antennaInactiveAfter) },
		queues: resolveQueues(source.queues),
		observability: {
			logging: source.observability.logging,
			telemetry: resolveTelemetry(source),
		},
		runtime: {
			version: meta.version,
			host: instanceUrl.host,
			hostname: instanceUrl.hostname,
			apiUrl: `${url}/api`,
			authUrl: `${url}/auth`,
			userAgent: `${PRODUCT_NAME}/${meta.version} (${url})`,
			frontendManifestExists: fs.existsSync(resolve(projectBuiltDir, '_frontend_vite_/manifest.json')),
			frontendEmbedManifestExists: fs.existsSync(resolve(projectBuiltDir, '_frontend_embed_vite_/manifest.json')),
			rootDir,
		},
	};
}

export function loadConfig(): Config {
	if (!fs.existsSync(compiledConfigFilePath)) {
		throw new Error("Compiled configuration file not found. Try running 'bun run compile-config'.");
	}
	const envelope = compiledConfigEnvelopeSchema.parse(JSON.parse(fs.readFileSync(compiledConfigFilePath, 'utf-8')));
	const meta = JSON.parse(fs.readFileSync(resolve(projectBuiltDir, 'meta.json'), 'utf-8')) as { version: string };
	return materializeConfig(envelope.config, meta);
}

const REDACTED = '***';

/** URL に埋め込まれた資格情報とクエリ文字列を伏せる。 */
function redactUrlSecrets(value: string | undefined): string | undefined {
	if (value == null) return undefined;
	const url = new URL(value);
	if (url.username !== '' || url.password !== '') {
		url.username = REDACTED;
		url.password = REDACTED;
	}
	if (url.search !== '') url.search = `?${REDACTED}`;
	return url.toString();
}

function redactValkey(valkey: Config['valkey']): Config['valkey'] {
	return Object.fromEntries(
		Object.entries(valkey).map(([name, connection]) => [
			name,
			{ ...connection, ...optionalProperty('password', connection.password == null ? undefined : REDACTED) },
		]),
	) as Config['valkey'];
}

function redactSearch(search: Config['search']): Config['search'] {
	if (search.meilisearch == null) return search;
	return { ...search, meilisearch: { ...search.meilisearch, apiKey: REDACTED } };
}

function redactTelemetryBackend(
	backend: Config['observability']['telemetry']['backend'],
): Config['observability']['telemetry']['backend'] {
	if (backend == null) return undefined;
	return {
		...backend,
		endpoint: redactUrlSecrets(backend.endpoint)!,
		...optionalProperty(
			'tracePropagationTargets',
			backend.tracePropagationTargets?.map((t) => redactUrlSecrets(t)!),
		),
		...optionalProperty(
			'headers',
			backend.headers == null ? undefined : Object.fromEntries(Object.keys(backend.headers).map((n) => [n, REDACTED])),
		),
	};
}

/** 設定を外部へ見せる用に、資格情報を伏せた複製を作る。 */
export function createRedactedConfig(config: Config): object {
	return {
		...config,
		instance: {
			...config.instance,
			...optionalProperty('setupPassword', config.instance.setupPassword == null ? undefined : REDACTED),
		},
		database: { ...config.database, primary: { ...config.database.primary, password: REDACTED } },
		valkey: redactValkey(config.valkey),
		search: redactSearch(config.search),
		outboundNetwork: {
			...config.outboundNetwork,
			proxy: {
				...config.outboundNetwork.proxy,
				url: redactUrlSecrets(config.outboundNetwork.proxy.url),
				smtpUrl: redactUrlSecrets(config.outboundNetwork.proxy.smtpUrl),
			},
		},
		media: {
			...config.media,
			proxyUrl: redactUrlSecrets(config.media.proxyUrl),
			videoThumbnailGeneratorUrl: redactUrlSecrets(config.media.videoThumbnailGeneratorUrl ?? undefined) ?? null,
		},
		observability: {
			...config.observability,
			telemetry: {
				...config.observability.telemetry,
				backend: redactTelemetryBackend(config.observability.telemetry.backend),
			},
		},
	};
}
