/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { createRedactedConfig, loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { updateMetaInDatabase } from '@/core/MetaStore.js';
import { createRedisForPub } from '@/runtime-dependencies.js';
import { createHonoEventPublishers } from '@/server/rest/events.js';

process.title = 'Erebia CLI';

async function ping(): Promise<void> {
	console.log('pong');
}

function validateConfig(): void {
	loadConfig();
	console.log('Configuration is valid.');
}

function showConfig(): void {
	console.log(JSON.stringify(createRedactedConfig(loadConfig()), null, 2));
}

async function diagnoseConfig(): Promise<void> {
	const config = loadConfig();
	const pool = createDrizzlePool(config);
	const connections = Array.from(new Set(Object.values(config.valkey)));
	try {
		await pool.query('SELECT 1');
		console.log('PostgreSQL: ok');
		for (const [index, options] of connections.entries()) {
			const redis = new Redis.Redis({ ...options, lazyConnect: true });
			try {
				await redis.connect();
				await redis.ping();
				console.log(`Valkey connection ${index + 1}: ok`);
			} finally {
				redis.disconnect(false);
			}
		}
	} finally {
		await pool.end();
	}
}

async function resetCaptcha(): Promise<void> {
	const config = loadConfig();
	const pool = createDrizzlePool(config);
	const db = createDrizzleDatabase(pool, config);
	const redisForPub = createRedisForPub(config);

	try {
		const { publishInternalEvent } = createHonoEventPublishers({
			config,
			publish: (host, message) => redisForPub.publish(host, message),
		});

		const { before, after } = await updateMetaInDatabase(db, {
			enableHcaptcha: false,
			hcaptchaSiteKey: null,
			hcaptchaSecretKey: null,
			enableMcaptcha: false,
			mcaptchaSitekey: null,
			mcaptchaSecretKey: null,
			mcaptchaInstanceUrl: null,
			enableRecaptcha: false,
			recaptchaSiteKey: null,
			recaptchaSecretKey: null,
			enableTurnstile: false,
			turnstileSiteKey: null,
			turnstileSecretKey: null,
			enableTestcaptcha: false,
		});
		publishInternalEvent('metaUpdated', {
			...(before == null ? {} : { before }),
			after,
		});
	} finally {
		await pool.end();
		redisForPub.disconnect();
	}
}

const command = process.argv[2] ?? 'help';

switch (command) {
	case 'help': {
		console.log('Available commands:');
		console.log('  help - Displays this help message');
		console.log('  reset-captcha - Resets the captcha');
		console.log('  config validate - Validates the effective server configuration');
		console.log('  config show - Prints the effective configuration with secrets redacted');
		console.log('  config doctor - Checks PostgreSQL and Valkey connectivity');
		break;
	}
	case 'ping': {
		await ping();
		break;
	}
	case 'reset-captcha': {
		await resetCaptcha();
		console.log('Captcha has been reset.');
		break;
	}
	case 'config': {
		switch (process.argv[3]) {
			case 'validate':
				validateConfig();
				break;
			case 'show':
				showConfig();
				break;
			case 'doctor':
				await diagnoseConfig();
				break;
			default:
				console.error('Use config validate, config show, or config doctor.');
				process.exit(1);
		}
		break;
	}
	default: {
		console.error(`Unrecognized command: ${command}`);
		console.error('Use "help" to see available commands.');
		process.exit(1);
	}
}

process.exit(0);
