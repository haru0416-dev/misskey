/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const { heartbeatMock } = vi.hoisted(() => ({
	heartbeatMock: vi.fn(),
}));

vi.mock('misskey-js', () => ({
	Stream: class {
		public heartbeat = heartbeatMock;
	},
}));

vi.mock('@/i.js', () => ({
	$i: null,
}));

vi.mock('@shared/utility/config.js', () => ({
	wsOrigin: 'ws://example.test',
}));

import { useStream } from '@/stream.js';

describe('stream heartbeat', () => {
	const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');

	beforeAll(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterAll(() => {
		vi.useRealTimers();
		if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
	});

	test('pauses while hidden and resumes without duplicate timers', async () => {
		useStream();
		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));

		await vi.advanceTimersByTimeAsync(120_000);
		expect(heartbeatMock).not.toHaveBeenCalled();

		Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
		expect(heartbeatMock).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(60_000);
		expect(heartbeatMock).toHaveBeenCalledTimes(2);
	});
});
