/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { createRedactedConfig, materializeConfig } from '@/config.js';
import { parseByteSize, parseDuration, sourceConfigV2Schema } from '@/config-schema.js';

function createSourceConfig() {
	return {
		configVersion: 2 as const,
		instance: { url: 'https://example.test' },
		database: {
			primary: {
				host: 'localhost',
				name: 'misskey',
				user: 'misskey',
				password: { plainText: 'database-secret' },
			},
		},
		valkey: {
			connections: {
				primary: { host: 'localhost' },
			},
		},
	};
}

afterEach(() => {
	delete process.env.TEST_CONFIG_SECRET;
});

describe('configVersion 2 schema', () => {
	test('materializes defaults and converts explicit units', () => {
		const source = sourceConfigV2Schema.parse(createSourceConfig());
		const config = materializeConfig(source, { version: 'test' });

		expect(config.server.listen).toEqual({ tcp: { address: '0.0.0.0', port: 3000 } });
		expect(config.database.pool.statementTimeoutMs).toBe(10_000);
		expect(config.database.primary.ssl).toBeUndefined();
		expect(config.limits.maximumFileSizeBytes).toBe(250 * 1024 * 1024);
		expect(config.queues.deliver.concurrencyPerWorker).toBe(128);
	});

	test('rejects old and unknown configuration keys', () => {
		expect(() => sourceConfigV2Schema.parse({
			...createSourceConfig(),
			url: 'https://legacy.example',
		})).toThrow();
		expect(() => sourceConfigV2Schema.parse({
			...createSourceConfig(),
			configVersion: 1,
		})).toThrow();
	});

	test('rejects invalid network ranges and Meilisearch paths', () => {
		expect(() => sourceConfigV2Schema.parse({
			...createSourceConfig(),
			server: { reverseProxy: { trustedNetworks: ['not-a-network'] } },
		})).toThrow();
		expect(() => sourceConfigV2Schema.parse({
			...createSourceConfig(),
			search: {
				provider: 'meilisearch',
				meilisearch: {
					endpoint: 'https://search.example.test/prefix',
					apiKey: { plainText: 'search-secret' },
					index: 'misskey',
				},
			},
		})).toThrow();
	});

	test('requires referenced environment secrets', () => {
		const source = sourceConfigV2Schema.parse({
			...createSourceConfig(),
			database: {
				primary: {
					host: 'localhost',
					name: 'misskey',
					user: 'misskey',
					password: { fromEnvironment: 'TEST_CONFIG_SECRET' },
				},
			},
		});
		expect(() => materializeConfig(source, { version: 'test' })).toThrow(/TEST_CONFIG_SECRET/);
		process.env.TEST_CONFIG_SECRET = 'resolved-secret';
		expect(materializeConfig(source, { version: 'test' }).database.primary.password).toBe('resolved-secret');
	});

	test('redacts every resolved credential represented by the effective config', () => {
		const source = sourceConfigV2Schema.parse({
			...createSourceConfig(),
			outboundNetwork: {
				proxy: {
					url: 'http://proxy-user:proxy-password@proxy.example.test:8080',
					smtpUrl: 'socks5://smtp-user:smtp-password@proxy.example.test:1080',
				},
			},
			media: {
				videoThumbnailGeneratorUrl: 'https://media.example.test/thumbnail?token=media-secret',
			},
			observability: {
				telemetry: {
					backend: {
						endpoint: 'https://telemetry.example.test/v1/traces?token=telemetry-secret',
					},
				},
			},
		});
		const serialized = JSON.stringify(createRedactedConfig(materializeConfig(source, { version: 'test' })));
		expect(serialized).not.toContain('database-secret');
		expect(serialized).not.toContain('proxy-user');
		expect(serialized).not.toContain('proxy-password');
		expect(serialized).not.toContain('smtp-user');
		expect(serialized).not.toContain('smtp-password');
		expect(serialized).not.toContain('media-secret');
		expect(serialized).not.toContain('telemetry-secret');
		expect(serialized).toContain('***');
	});
});

describe('config units', () => {
	test('parses duration and binary byte units', () => {
		expect(parseDuration('7d')).toBe(604_800_000);
		expect(parseByteSize('250MiB')).toBe(262_144_000);
	});

	test('rejects ambiguous units', () => {
		expect(() => parseDuration('1.5h')).toThrow();
		expect(() => parseByteSize('250MB')).toThrow();
	});
});
