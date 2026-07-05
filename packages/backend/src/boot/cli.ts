/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { updateMetaInDatabase } from '@/core/MetaStore.js';
import { createRedisForPub } from '@/runtime-dependencies.js';
import { createHonoEventPublishers } from '@/server/rest/events.js';

process.title = 'Misskey Cli';

async function ping(): Promise<void> {
	console.log('pong');
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
		publishInternalEvent('metaUpdated', { before, after });
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
	default: {
		console.error(`Unrecognized command: ${command}`);
		console.error('Use "help" to see available commands.');
		process.exit(1);
	}
}

process.exit(0);
