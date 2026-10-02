/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { describe, expect, test, vi } from 'vitest';
import type { SystemQueue } from '@/core/queue/queues.js';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import { syncSystemJobSchedulers, systemJobSchedulers } from '@/queue/system-job-schedulers.js';

const config = {
	queues: {
		retention: {
			completedMaximumAgeSeconds: 600,
			completedMaximumCount: 20,
			failedMaximumAgeSeconds: 1200,
			failedMaximumCount: 40,
		},
	},
} as Pick<Config, 'queues'>;

function createQueue(registeredKeys: string[] = []) {
	const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
	const getJobSchedulers = vi.fn().mockResolvedValue(registeredKeys.map((key) => ({ key })));
	const removeJobScheduler = vi.fn().mockResolvedValue(true);

	return {
		queue: {
			upsertJobScheduler,
			getJobSchedulers,
			removeJobScheduler,
		} as unknown as SystemQueue,
		upsertJobScheduler,
		getJobSchedulers,
		removeJobScheduler,
	};
}

describe('syncSystemJobSchedulers', () => {
	test('registers every system scheduler on Valkey with its cron pattern and retention', async () => {
		const { valkey } = loadConfig();
		// 共有の system queue には触れず、このテスト専用の prefix に登録して読み戻す。
		const queue = new Queue('system', {
			connection: { host: valkey.jobQueue.host, port: valkey.jobQueue.port, db: valkey.jobQueue.db },
			prefix: `test-schedulers-${randomUUID()}`,
		});
		try {
			await syncSystemJobSchedulers(queue as unknown as SystemQueue, config);
			const registered = await Promise.all(
				systemJobSchedulers.map(async (scheduler) => [scheduler, await queue.getJobScheduler(scheduler.name)] as const),
			);
			for (const [scheduler, actual] of registered) {
				expect(actual, scheduler.name).toMatchObject({
					key: scheduler.name,
					name: scheduler.name,
					pattern: scheduler.pattern,
					template: {
						opts: {
							removeOnComplete: { age: 600, count: 20 },
							removeOnFail: { age: 1200, count: 40 },
						},
					},
				});
			}
			expect((await queue.getJobSchedulers()).map((scheduler) => scheduler.key).sort()).toEqual(
				systemJobSchedulers.map((scheduler) => scheduler.name).sort(),
			);
		} finally {
			await queue.obliterate({ force: true });
			await queue.close();
		}
	});

	test('removes obsolete schedulers without removing current schedulers', async () => {
		const currentKey = systemJobSchedulers[0].name;
		const { queue, removeJobScheduler } = createQueue([currentKey, 'obsoleteJob']);

		await syncSystemJobSchedulers(queue, config);

		expect(removeJobScheduler).toHaveBeenCalledOnce();
		expect(removeJobScheduler).toHaveBeenCalledWith('obsoleteJob');
	});

	test('does not remove schedulers when registration fails', async () => {
		const { queue, upsertJobScheduler, getJobSchedulers, removeJobScheduler } = createQueue(['obsoleteJob']);
		upsertJobScheduler.mockRejectedValueOnce(new Error('Redis unavailable'));

		await expect(syncSystemJobSchedulers(queue, config)).rejects.toThrow('Redis unavailable');

		expect(getJobSchedulers).not.toHaveBeenCalled();
		expect(removeJobScheduler).not.toHaveBeenCalled();
	});
});
