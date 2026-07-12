/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll } from 'vitest';
import { Redis } from 'ioredis';
import { loadConfig } from '@/config.js';
import { initTestDb, sendEnvResetRequest } from './utils.js';

// DBリセット + アプリ再起動はCIランナーの負荷次第でvitest既定のhookTimeout (10秒) を超えることがあり、
// 超えるとそのファイルの全テストがskipされてしまうため、余裕を持ったタイムアウトを指定する
beforeAll(async () => {
	await initTestDb(false);
	const config = loadConfig();
	const redis = new Redis(config.redis);
	try {
		await redis.flushdb();
	} finally {
		await redis.quit();
	}
	await sendEnvResetRequest();
}, 60_000);
