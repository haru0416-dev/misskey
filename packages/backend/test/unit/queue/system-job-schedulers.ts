/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { SystemQueue } from '@/core/queues.js';
import { syncSystemJobSchedulers, systemJobSchedulers } from '@/queue/system-job-schedulers.js';

function createQueue(registeredKeys: string[] = []) {
	const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
	const getJobSchedulers = vi.fn().mockResolvedValue(registeredKeys.map(key => ({ key })));
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

		await syncSystemJobSchedulers(queue);

		expect(upsertJobScheduler).toHaveBeenCalledTimes(systemJobSchedulers.length);
		for (const scheduler of systemJobSchedulers) {
			expect(upsertJobScheduler).toHaveBeenCalledWith(scheduler.name, {
				pattern: scheduler.pattern,
				immediately: false,
			}, {
				name: scheduler.name,
				opts: {
					removeOnComplete: { age: 60 * 60 * 24 * 7 },
					removeOnFail: { age: 60 * 60 * 24 * 7 },
				},
			});
		}
	});

	test('removes obsolete schedulers without removing current schedulers', async () => {
		const currentKey = systemJobSchedulers[0].name;
		const { queue, removeJobScheduler } = createQueue([currentKey, 'obsoleteJob']);

		await syncSystemJobSchedulers(queue);

		expect(removeJobScheduler).toHaveBeenCalledOnce();
		expect(removeJobScheduler).toHaveBeenCalledWith('obsoleteJob');
	});

	test('does not remove schedulers when registration fails', async () => {
		const { queue, upsertJobScheduler, getJobSchedulers, removeJobScheduler } = createQueue(['obsoleteJob']);
		upsertJobScheduler.mockRejectedValueOnce(new Error('Redis unavailable'));

		await expect(syncSystemJobSchedulers(queue)).rejects.toThrow('Redis unavailable');

		expect(getJobSchedulers).not.toHaveBeenCalled();
		expect(removeJobScheduler).not.toHaveBeenCalled();
	});
});
