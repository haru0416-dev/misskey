/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { baseQueueEventsOptions, baseQueueOptions, baseWorkerOptions, QUEUE } from '@/queue/const.js';

describe('queue options', () => {
	const config = loadConfig();

	test('keeps command timeout for producers', () => {
		expect(baseQueueOptions(config, QUEUE.SYSTEM).connection).toMatchObject({
			commandTimeout: config.valkey.jobQueue.commandTimeout,
		});
	});

	test('allows workers to block without ioredis timing out', () => {
		const connection = baseWorkerOptions(config, QUEUE.SYSTEM).connection;

		expect(connection).not.toHaveProperty('commandTimeout');
		expect(connection).toMatchObject({ maxRetriesPerRequest: null });
	});

	test('allows queue events to block without ioredis timing out', () => {
		const connection = baseQueueEventsOptions(config, QUEUE.SYSTEM).connection;

		expect(connection).not.toHaveProperty('commandTimeout');
		expect(connection).toMatchObject({ maxRetriesPerRequest: null });
	});
});
