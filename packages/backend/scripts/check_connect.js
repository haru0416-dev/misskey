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

		await Promise.race([
			new Promise((_, reject) => redis.on('error', e => reject(e))),
			redis.connect(),
		]);
	} finally {
		redis.disconnect(false);
	}
}

// If not all of these are defined, the default one gets reused.
// so we use a Set to only try connecting once to each **uniq** redis.
const promises = Array
	.from(new Set([
		config.valkey.primary,
		config.valkey.pubsub,
		config.valkey.jobQueue,
		config.valkey.timelines,
		config.valkey.reactions,
	]))
	.map(connectToRedis)
	.concat([
		connectToPostgres(),
	]);

await Promise.all(promises);
