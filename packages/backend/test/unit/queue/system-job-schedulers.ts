/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { SystemQueue } from '@/core/queues.js';
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
	test('registers every system scheduler with the expected cron pattern and retention', async () => {
		const { queue, upsertJobScheduler } = createQueue();

		await syncSystemJobSchedulers(queue, config);

		expect(upsertJobScheduler).toHaveBeenCalledTimes(systemJobSchedulers.length);
		for (const scheduler of systemJobSchedulers) {
			expect(upsertJobScheduler).toHaveBeenCalledWith(
				scheduler.name,
				{
					pattern: scheduler.pattern,
					immediately: false,
				},
				{
					name: scheduler.name,
					opts: {
						removeOnComplete: { age: 600, count: 20 },
						removeOnFail: { age: 1200, count: 40 },
					},
				},
			);
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
