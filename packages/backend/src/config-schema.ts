/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import ipaddr from 'ipaddr.js';

const environmentNameSchema = z.string().regex(/^[A-Z_][A-Z0-9_]*$/);

export const secretSourceSchema = z.union([
	z.strictObject({ fromEnvironment: environmentNameSchema }),
	z.strictObject({ plainText: z.string() }),
]);

const durationSchema = z.string().regex(/^(0|[1-9][0-9]*)(ms|s|m|h|d)$/);
const byteSizeSchema = z.string().regex(/^(0|[1-9][0-9]*)(B|KiB|MiB|GiB)$/);
const httpUrlSchema = z.url().refine((value) => {
	const url = new URL(value);
	return (
		(url.protocol === 'http:' || url.protocol === 'https:') &&
		url.username === '' &&
		url.password === '' &&
		url.hash === ''
	);
}, 'Must be an HTTP(S) URL without credentials or a fragment');
const originUrlSchema = httpUrlSchema.refine((value) => {
	const url = new URL(value);
	return url.pathname === '/' && url.search === '';
}, 'Must be an HTTP(S) origin without a path or query parameters');
const publicTelemetryUrlSchema = httpUrlSchema.refine(
	(value) => new URL(value).search === '',
	'Public telemetry URLs must not contain query parameters',
);
const cidrSchema = z.string().refine((value) => {
	try {
		ipaddr.parseCIDR(value);
		return true;
	} catch {
		return false;
	}
}, 'Must be an IPv4 or IPv6 CIDR range');
const positiveIntegerSchema = z.int().positive();
const nonNegativeIntegerSchema = z.int().nonnegative();
const portSchema = z.int().min(1).max(65535);

const tcpListenSchema = z.strictObject({
	tcp: z.strictObject({
		address: z.string().min(1).default('0.0.0.0'),
		port: portSchema.default(3000),
	}),
});

const unixSocketListenSchema = z.strictObject({
	unixSocket: z.strictObject({
		path: z.string().min(1),
		permissions: z
			.string()
			.regex(/^[0-7]{3,4}$/)
			.optional(),
	}),
});

const valkeyConnectionSchema = z.strictObject({
	host: z.string().min(1),
	port: portSchema.default(6379),
	username: z.string().min(1).optional(),
	password: secretSourceSchema.optional(),
	database: nonNegativeIntegerSchema.default(0),
	keyPrefix: z.string().min(1).optional(),
	addressFamily: z.enum(['auto', 'ipv4', 'ipv6']).default('auto'),
	tls: z.boolean().default(false),
	connectionTimeout: durationSchema.default('5s'),
	commandTimeout: durationSchema.default('10s'),
});

const queueConcurrencySchema = z.strictObject({
	concurrencyPerWorker: positiveIntegerSchema,
});

const rateLimitedQueueSchema = queueConcurrencySchema.extend({
	maximumStartsPerSecond: positiveIntegerSchema.optional(),
});

const retriedRateLimitedQueueSchema = rateLimitedQueueSchema.extend({
	maximumAttempts: positiveIntegerSchema.optional(),
});

const telemetryBackendSchema = z.strictObject({
	endpoint: httpUrlSchema,
	headers: z.record(z.string().min(1), secretSourceSchema).optional(),
	serviceName: z.string().min(1).optional(),
	tracesSampleRatio: z.number().min(0).max(1).optional(),
	tracePropagationTargets: z.array(httpUrlSchema).optional(),
	disabledInstrumentations: z.array(z.string().min(1)).optional(),
});

const telemetryFrontendSchema = z.strictObject({
	endpoint: publicTelemetryUrlSchema,
	serviceName: z.string().min(1).optional(),
	tracesSampleRatio: z.number().min(0).max(1).optional(),
	propagateTraceHeaderCorsUrls: z.array(publicTelemetryUrlSchema).optional(),
});

export const sourceConfigV2Schema = z.strictObject({
	configVersion: z.literal(2),
	instance: z.strictObject({
		url: httpUrlSchema,
		setupPassword: secretSourceSchema.optional(),
		publishSourceTarball: z.boolean().default(false),
	}),
	server: z
		.strictObject({
			listen: z.union([tcpListenSchema, unixSocketListenSchema]).default({ tcp: { address: '0.0.0.0', port: 3000 } }),
			reverseProxy: z
				.strictObject({
					trustedNetworks: z
						.array(cidrSchema)
						.default(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.1/32', '::1/128', 'fc00::/7']),
				})
				.prefault({}),
			http: z
				.strictObject({
					maximumRequestBodySize: byteSizeSchema.default('251MiB'),
					gracefulShutdownTimeout: durationSchema.default('30s'),
					hsts: z.boolean().default(true),
					ipRateLimit: z.boolean().default(true),
				})
				.prefault({}),
			process: z
				.strictObject({
					/**
					 * HTTP を捌くプロセス数。1 ならメインプロセス自身が listen し、2 以上ならメインプロセスは
					 * listen せず fork したワーカーだけが listen する (bun の node:cluster は SO_REUSEPORT 実装)。
					 * このVPS (6コア) での実測では 1→3 で rps +42% だが CPU効率は 730→609 rps/core へ落ちる。
					 */
					httpWorkers: nonNegativeIntegerSchema.default(1),
					/** ジョブキューを捌くプロセス数。0 にするとこのホストではキューを処理しない。 */
					queueWorkers: nonNegativeIntegerSchema.default(1),
					computationThreadsPerWorker: positiveIntegerSchema.default(1),
					pidFile: z.string().min(1).default('/tmp/misskey.pid'),
				})
				.prefault({}),
		})
		.prefault({}),
	database: z
		.strictObject({
			primary: z.strictObject({
				host: z.string().min(1),
				port: portSchema.default(5432),
				name: z.string().min(1),
				user: z.string().min(1),
				password: secretSourceSchema,
				ssl: z.boolean().optional(),
			}),
			pool: z
				.strictObject({
					minimumConnections: nonNegativeIntegerSchema.default(0),
					/**
					 * このホストが PostgreSQL へ張る接続数の上限。**プロセスごとではなくホスト全体の予算**で、
					 * DBを使うプロセス数 (HTTP + キュー) で割ったものが各プロセスのプール上限になる。
					 *
					 * プロセスごとの指定にすると `httpWorkers: 3` + キュー1 で 30×4 = 120 接続を要求し、
					 * PostgreSQL の既定 `max_connections = 100` に張り付いて溢れる (実測で確認)。
					 *
					 * 既定の 60 は「既定トポロジ (HTTP 1 + キュー 1) で 1プロセスあたり 30」になる値。
					 * 1プロセスが必要とする接続数はそのプロセスが受け持つ同時実行数に比例するので、
					 * プロセスを増やしたときにこの値を増やす必要は無い (同時実行も分割されるため)。
					 * 実測 (同時128接続、/api/notes): HTTP1プロセスでは 15/プロセスだと 1023 rps に対し
					 * 30/プロセスで 1154 rps (+12.8%)。HTTP3プロセスでは 7/プロセスで 1336 rps に対し
					 * 24/プロセスでも 1383 rps (+3.5%) と、分割後は少ない接続数でほぼ頭打ちになる。
					 */
					maximumConnectionsPerHost: positiveIntegerSchema.default(60),
					connectionTimeout: durationSchema.default('5s'),
					idleConnectionTimeout: durationSchema.default('30s'),
					statementTimeout: durationSchema.default('10s'),
				})
				.prefault({}),
		})
		.refine((value) => value.pool.minimumConnections <= value.pool.maximumConnectionsPerHost, {
			message: 'minimumConnections must not exceed maximumConnectionsPerHost',
			path: ['pool', 'minimumConnections'],
		}),
	valkey: z
		.strictObject({
			connections: z
				.record(z.string().min(1), valkeyConnectionSchema)
				.refine(
					(value): value is typeof value & { primary: z.output<typeof valkeyConnectionSchema> } =>
						value['primary'] != null,
					{
						message: 'A primary connection is required',
					},
				),
			assignments: z
				.strictObject({
					pubsub: z.string().min(1).default('primary'),
					jobQueue: z.string().min(1).default('primary'),
					timelines: z.string().min(1).default('primary'),
					reactions: z.string().min(1).default('primary'),
				})
				.prefault({}),
		})
		.superRefine((value, context) => {
			for (const [purpose, connection] of Object.entries(value.assignments)) {
				if (value.connections[connection] == null) {
					context.addIssue({
						code: 'custom',
						message: `Unknown Valkey connection: ${connection}`,
						path: ['assignments', purpose],
					});
				}
			}
		}),
	search: z
		.discriminatedUnion('provider', [
			z.strictObject({ provider: z.enum(['sqlLike', 'sqlPgroonga']).default('sqlLike') }),
			z.strictObject({
				provider: z.literal('meilisearch'),
				meilisearch: z.strictObject({
					endpoint: originUrlSchema,
					apiKey: secretSourceSchema,
					index: z.string().min(1),
					scope: z.union([z.enum(['local', 'global']), z.array(z.string().min(1))]).default('local'),
				}),
			}),
		])
		.default({ provider: 'sqlLike' }),
	outboundNetwork: z
		.strictObject({
			bindAddress: z.string().min(1).optional(),
			addressFamily: z.enum(['ipv4', 'ipv6', 'dualStack']).default('dualStack'),
			proxy: z
				.strictObject({
					url: z.url().optional(),
					smtpUrl: z.url().optional(),
					bypassHosts: z.array(z.string().min(1)).default([]),
				})
				.prefault({}),
			http: z
				.strictObject({
					connectionTimeout: durationSchema.default('10s'),
					requestTimeout: durationSchema.default('5s'),
					maximumResponseSize: byteSizeSchema.default('10MiB'),
					maximumSockets: positiveIntegerSchema.default(256),
					maximumFreeSockets: nonNegativeIntegerSchema.default(256),
					keepAliveDuration: durationSchema.default('30s'),
					maximumRedirects: nonNegativeIntegerSchema.default(20),
				})
				.prefault({}),
			dnsCache: z
				.strictObject({
					successTtl: durationSchema.default('1h'),
					failureTtl: durationSchema.default('30s'),
				})
				.prefault({}),
			privateNetworkAccess: z
				.strictObject({
					allowedNetworks: z.array(cidrSchema).default([]),
				})
				.prefault({}),
		})
		.prefault({}),
	media: z
		.strictObject({
			externalProxyUrl: httpUrlSchema.optional(),
			videoThumbnailGeneratorUrl: httpUrlSchema.optional(),
		})
		.prefault({}),
	limits: z
		.strictObject({
			maximumFileSize: byteSizeSchema.default('250MiB'),
			channelTimelineNotes: positiveIntegerSchema.default(1000),
			userNotifications: positiveIntegerSchema.default(500),
		})
		.prefault({}),
	maintenance: z
		.strictObject({
			antennaInactiveAfter: durationSchema.default('7d'),
		})
		.prefault({}),
	queues: z
		.strictObject({
			deliver: retriedRateLimitedQueueSchema.default({
				concurrencyPerWorker: 128,
				maximumStartsPerSecond: 128,
				maximumAttempts: 12,
			}),
			inbox: retriedRateLimitedQueueSchema.default({
				concurrencyPerWorker: 16,
				maximumStartsPerSecond: 32,
				maximumAttempts: 8,
			}),
			relationships: rateLimitedQueueSchema.default({ concurrencyPerWorker: 16, maximumStartsPerSecond: 64 }),
			database: queueConcurrencySchema.default({ concurrencyPerWorker: 1 }),
			system: queueConcurrencySchema.default({ concurrencyPerWorker: 1 }),
			objectStorage: queueConcurrencySchema.default({ concurrencyPerWorker: 16 }),
			userWebhooks: rateLimitedQueueSchema.default({ concurrencyPerWorker: 64, maximumStartsPerSecond: 64 }),
			systemWebhooks: rateLimitedQueueSchema.default({ concurrencyPerWorker: 16, maximumStartsPerSecond: 16 }),
			backoff: z
				.strictObject({
					initialDelay: durationSchema.default('1m'),
					maximumDelay: durationSchema.default('8h'),
					jitterRatio: z.number().min(0).max(1).default(0.2),
				})
				.prefault({}),
			retention: z
				.strictObject({
					completedMaximumAge: durationSchema.default('7d'),
					completedMaximumCount: positiveIntegerSchema.default(30),
					failedMaximumAge: durationSchema.default('7d'),
					failedMaximumCount: positiveIntegerSchema.default(100),
				})
				.prefault({}),
		})
		.prefault({}),
	observability: z
		.strictObject({
			logging: z
				.strictObject({
					level: z.enum(['debug', 'info', 'warning', 'error']).default('info'),
					format: z.enum(['pretty', 'json']).default('pretty'),
					includeTimestamp: z.boolean().default(false),
					sql: z
						.strictObject({
							enabled: z.boolean().default(false),
							logParameters: z.boolean().default(false),
							maximumQueryLength: positiveIntegerSchema.default(100),
						})
						.prefault({}),
				})
				.prefault({}),
			telemetry: z
				.strictObject({
					backend: telemetryBackendSchema.optional(),
					frontend: telemetryFrontendSchema.optional(),
				})
				.prefault({}),
		})
		.prefault({}),
});

export const compiledConfigEnvelopeSchema = z.strictObject({
	compiledConfigVersion: z.literal(1),
	sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
	config: sourceConfigV2Schema,
});

export type SecretSource = z.infer<typeof secretSourceSchema>;
export type SourceConfigV2 = z.input<typeof sourceConfigV2Schema>;
export type CompiledConfigV2 = z.output<typeof sourceConfigV2Schema>;
export type CompiledConfigEnvelope = z.output<typeof compiledConfigEnvelopeSchema>;

export function parseDuration(value: string): number {
	const match = /^(0|[1-9][0-9]*)(ms|s|m|h|d)$/.exec(value);
	if (match == null) throw new Error(`Invalid duration: ${value}`);
	const [, amount, unit] = match;
	if (amount == null || unit == null) throw new Error(`Invalid duration: ${value}`);
	const factors = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
	const result = BigInt(amount) * BigInt(factors[unit as keyof typeof factors]);
	if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Duration is too large: ${value}`);
	return Number(result);
}

export function parseByteSize(value: string): number {
	const match = /^(0|[1-9][0-9]*)(B|KiB|MiB|GiB)$/.exec(value);
	if (match == null) throw new Error(`Invalid byte size: ${value}`);
	const [, amount, unit] = match;
	if (amount == null || unit == null) throw new Error(`Invalid byte size: ${value}`);
	const factors = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 } as const;
	const result = BigInt(amount) * BigInt(factors[unit as keyof typeof factors]);
	if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Byte size is too large: ${value}`);
	return Number(result);
}
