/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Redis from 'ioredis';
import { loadConfig } from '../built/config.js';
import { createDrizzlePool } from '../built/drizzle.js';

const config = loadConfig();

async function connectToPostgres() {
	const pool = createDrizzlePool(config);
	try {
		await pool.query('SELECT 1');
	} finally {
		await pool.end();
	}
}

async function connectToRedis(redisOptions) {
	let redis;
	try {
		redis = new Redis({
			...redisOptions,
			lazyConnect: true,
			reconnectOnError: false,
			showFriendlyErrorStack: true,
		});

		await Promise.race([new Promise((_, reject) => redis.on('error', (e) => reject(e))), redis.connect()]);
	} finally {
		redis.disconnect(false);
	}
}

// 個別設定がない接続先には primary の設定が再利用されるため、Set で重複接続を避ける。
const promises = Array.from(
	new Set([
		config.valkey.primary,
		config.valkey.pubsub,
		config.valkey.jobQueue,
		config.valkey.timelines,
		config.valkey.reactions,
	]),
)
	.map(connectToRedis)
	.concat([connectToPostgres()]);

await Promise.all(promises);
