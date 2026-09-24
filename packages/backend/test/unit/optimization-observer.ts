/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from 'vitest';
import { pending } from '../../scripts/optimization/observe.mjs';
import type { Sample } from '../../scripts/optimization/observe.mjs';

test('完了済みoutboxの保持はdrainを妨げず、未完了stageは残件として数える', () => {
	const sample: Sample = {
		at: '2026-09-09T00:00:00.000Z',
		processes: { available: false, reason: '未取得' },
		database: { available: false, reason: '未取得' },
		outbox: {
			available: true,
			value: [
				{ state: 'ready', count: 1, oldest_ms: 100, recorded_attempts: 0 },
				{ state: 'publishing', count: 2, oldest_ms: 200, recorded_attempts: 0 },
				{ state: 'published', count: 3, oldest_ms: 300, recorded_attempts: 0 },
				{ state: 'completed', count: 4, oldest_ms: 10000, recorded_attempts: 0 },
			],
		},
		queues: { available: true, value: { version: '8.1.3', queues: [] } },
	};

	expect(pending(sample)).toBe(6);
	if (!sample.outbox.available) throw new Error('outbox observation unavailable');
	for (const row of sample.outbox.value) row.state = 'completed';
	expect(pending(sample)).toBe(0);
});
