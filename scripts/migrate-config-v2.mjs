/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { sourceConfigV2Schema } from '../packages/backend/src/config-schema.ts';

const [inputArgument, outputArgument] = process.argv.slice(2);
if (inputArgument == null || outputArgument == null) {
	console.error('Usage: bun run config:migrate <old-config.yml> <new-config.yml>');
	process.exit(1);
}

const inputPath = path.resolve(inputArgument);
const outputPath = path.resolve(outputArgument);
const old = yaml.load(await fs.readFile(inputPath, 'utf8'));
if (typeof old !== 'object' || old == null || Array.isArray(old))
	throw new Error('The source configuration must be an object.');
if (old.configVersion != null) throw new Error('The source configuration is already versioned.');

const secret = (value, environment) =>
	value == null ? { fromEnvironment: environment } : { plainText: String(value) };
const size = (value) => `${value}B`;
const duration = (value) => `${value}ms`;
const environmentInteger = (name) => {
	const value = process.env[name];
	if (value == null || value === '') return undefined;
	if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer.`);
	return Number(value);
};
const network = (value) => {
	const [address, prefix, extra] = value.split('/');
	const family = isIP(address);
	if (family === 0 || extra != null) throw new Error(`Invalid trusted proxy network: ${value}`);
	if (prefix == null) return `${address}/${family === 4 ? 32 : 128}`;
	const maximumPrefix = family === 4 ? 32 : 128;
	if (!/^\d+$/.test(prefix) || Number(prefix) > maximumPrefix)
		throw new Error(`Invalid trusted proxy network: ${value}`);
	return value;
};
const telemetryBackend = (source) => ({
	...source,
	...(source.headers == null
		? {}
		: {
				headers: Object.fromEntries(
					Object.entries(source.headers).map(([name, value]) => [name, { plainText: String(value) }]),
				),
			}),
});
const redisConnection = (source, path) => {
	const supportedKeys = new Set(['host', 'port', 'username', 'pass', 'db', 'prefix', 'family', 'tls']);
	const unsupportedKey = Object.keys(source).find((key) => !supportedKeys.has(key));
	if (unsupportedKey != null) throw new Error(`${path}.${unsupportedKey} cannot be migrated automatically.`);
	if (
		source.tls != null &&
		typeof source.tls !== 'boolean' &&
		(typeof source.tls !== 'object' || Object.keys(source.tls).length > 0)
	) {
		throw new Error(`${path}.tls contains options that cannot be migrated automatically.`);
	}
	return {
		host: source.host,
		port: source.port ?? 6379,
		...(source.username == null ? {} : { username: source.username }),
		...(source.pass == null ? {} : { password: secret(source.pass, 'VALKEY_PASSWORD') }),
		database: source.db ?? 0,
		...(source.prefix == null ? {} : { keyPrefix: source.prefix }),
		addressFamily: source.family === 4 ? 'ipv4' : source.family === 6 ? 'ipv6' : 'auto',
		...(source.tls == null ? {} : { tls: Boolean(source.tls) }),
	};
};

const instanceUrl = old.url ?? process.env.MISSKEY_URL;
if (typeof instanceUrl !== 'string') throw new Error('The old configuration or MISSKEY_URL must define url.');
if (typeof old.db !== 'object' || old.db == null) throw new Error('The old configuration must define db.');
if (typeof old.redis !== 'object' || old.redis == null) throw new Error('The old configuration must define redis.');

const connections = { primary: redisConnection(old.redis, 'redis') };
const assignments = {};
for (const [oldKey, newName, assignment] of [
	['redisForPubsub', 'pubsub', 'pubsub'],
	['redisForJobQueue', 'jobQueue', 'jobQueue'],
	['redisForTimelines', 'timelines', 'timelines'],
	['redisForReactions', 'reactions', 'reactions'],
]) {
	if (old[oldKey] == null) continue;
	connections[newName] = redisConnection(old[oldKey], oldKey);
	assignments[assignment] = newName;
}

const databaseExtra = old.db.extra ?? {};
const supportedDatabaseExtraKeys = new Set(['ssl', 'max', 'statement_timeout']);
const unsupportedDatabaseExtraKey = Object.keys(databaseExtra).find((key) => !supportedDatabaseExtraKeys.has(key));
if (unsupportedDatabaseExtraKey != null)
	throw new Error(`db.extra.${unsupportedDatabaseExtraKey} cannot be migrated automatically.`);
if (
	databaseExtra.ssl != null &&
	typeof databaseExtra.ssl !== 'boolean' &&
	(typeof databaseExtra.ssl !== 'object' || Object.keys(databaseExtra.ssl).length > 0)
) {
	throw new Error('db.extra.ssl contains options that cannot be migrated automatically.');
}

const migrated = {
	configVersion: 2,
	instance: {
		url: instanceUrl,
		...(old.setupPassword == null ? {} : { setupPassword: secret(old.setupPassword, 'EREBIA_SETUP_PASSWORD') }),
		publishSourceTarball: old.publishTarballInsteadOfProvideRepositoryUrl ?? false,
	},
	server: {
		listen:
			old.socket == null
				? { tcp: { address: '0.0.0.0', port: old.port ?? environmentInteger('PORT') ?? 3000 } }
				: { unixSocket: { path: old.socket, ...(old.chmodSocket == null ? {} : { permissions: old.chmodSocket }) } },
		reverseProxy: {
			trustedNetworks: Array.isArray(old.trustProxy)
				? old.trustProxy.map(network)
				: typeof old.trustProxy === 'string'
					? [network(old.trustProxy)]
					: old.trustProxy === true
						? ['0.0.0.0/0', '::/0']
						: old.trustProxy === false
							? []
							: old.trustProxy == null
								? undefined
								: (() => {
										throw new Error('Numeric trustProxy values cannot be represented by configVersion 2.');
									})(),
		},
		http: {
			maximumRequestBodySize: size((old.maxFileSize ?? 262_144_000) + 1024 * 1024),
			hsts: !(old.disableHsts ?? false),
			ipRateLimit: old.enableIpRateLimit ?? true,
		},
		process: {
			workers: old.clusterLimit ?? 1,
			computationThreadsPerWorker: old.threadPoolSize ?? 1,
			pidFile: old.pidFile ?? '/tmp/misskey.pid',
		},
	},
	database: {
		primary: {
			host: old.db.host,
			port: old.db.port ?? 5432,
			name: old.db.db ?? process.env.DATABASE_DB ?? 'misskey',
			user: old.db.user ?? process.env.DATABASE_USER ?? 'misskey',
			password: secret(old.db.pass, 'DATABASE_PASSWORD'),
			...(databaseExtra.ssl == null ? {} : { ssl: Boolean(databaseExtra.ssl) }),
		},
		pool: {
			maximumConnections: databaseExtra.max ?? 30,
			statementTimeout: duration(databaseExtra.statement_timeout ?? 10_000),
		},
	},
	valkey: { connections, assignments },
	search:
		old.fulltextSearch?.provider === 'meilisearch' && old.meilisearch != null
			? {
					provider: 'meilisearch',
					meilisearch: {
						endpoint: `${old.meilisearch.ssl ? 'https' : 'http'}://${old.meilisearch.host}:${old.meilisearch.port}`,
						apiKey: secret(old.meilisearch.apiKey, 'MEILISEARCH_API_KEY'),
						index: old.meilisearch.index,
						scope: old.meilisearch.scope ?? 'local',
					},
				}
			: { provider: old.fulltextSearch?.provider ?? 'sqlLike' },
	outboundNetwork: {
		...(old.outgoingAddress == null ? {} : { bindAddress: old.outgoingAddress }),
		addressFamily: old.outgoingAddressFamily === 'dual' ? 'dualStack' : (old.outgoingAddressFamily ?? 'dualStack'),
		proxy: {
			...(old.proxy == null ? {} : { url: old.proxy }),
			...(old.proxySmtp == null ? {} : { smtpUrl: old.proxySmtp }),
			bypassHosts: old.proxyBypassHosts ?? [],
		},
		privateNetworkAccess: { allowedNetworks: old.allowedPrivateNetworks ?? [] },
	},
	media: {
		...(old.mediaProxy == null ? {} : { externalProxyUrl: old.mediaProxy }),
		...(old.videoThumbnailGenerator == null ? {} : { videoThumbnailGeneratorUrl: old.videoThumbnailGenerator }),
	},
	limits: {
		maximumFileSize: size(old.maxFileSize ?? 262_144_000),
		channelTimelineNotes: old.perChannelMaxNoteCacheCount ?? 1000,
		userNotifications: old.perUserNotificationsMaxCount ?? 500,
	},
	maintenance: {
		antennaInactiveAfter: duration(old.deactivateAntennaThreshold ?? 604_800_000),
	},
	queues: {
		deliver: {
			concurrencyPerWorker: old.deliverJobConcurrency ?? 128,
			maximumStartsPerSecond: old.deliverJobPerSec ?? 128,
			maximumAttempts: old.deliverJobMaxAttempts ?? 12,
		},
		inbox: {
			concurrencyPerWorker: old.inboxJobConcurrency ?? 16,
			maximumStartsPerSecond: old.inboxJobPerSec ?? 32,
			maximumAttempts: old.inboxJobMaxAttempts ?? 8,
		},
		relationships: {
			concurrencyPerWorker: old.relationshipJobConcurrency ?? 16,
			maximumStartsPerSecond: old.relationshipJobPerSec ?? 64,
		},
		database: { concurrencyPerWorker: old.dbJobConcurrency ?? 1 },
		system: { concurrencyPerWorker: old.systemJobConcurrency ?? 1 },
		objectStorage: { concurrencyPerWorker: old.objectStorageJobConcurrency ?? 16 },
		userWebhooks: { concurrencyPerWorker: old.userWebhookJobConcurrency ?? 64 },
		systemWebhooks: { concurrencyPerWorker: old.systemWebhookJobConcurrency ?? 16 },
	},
	observability: {
		logging: {
			sql: {
				enabled: old.logging?.sql != null,
				logParameters: old.logging?.sql?.enableQueryParamLogging ?? false,
				maximumQueryLength: old.logging?.sql?.disableQueryTruncation ? 1_000_000 : 100,
			},
		},
		telemetry: {
			...(old.telemetryForBackend == null ? {} : { backend: telemetryBackend(old.telemetryForBackend) }),
			...(old.telemetryForFrontend == null ? {} : { frontend: old.telemetryForFrontend }),
		},
	},
};

sourceConfigV2Schema.parse(migrated);
await fs.writeFile(outputPath, yaml.dump(migrated, { noRefs: true, lineWidth: 120 }), { flag: 'wx', mode: 0o600 });
console.log(`${inputPath} -> ${outputPath}`);
