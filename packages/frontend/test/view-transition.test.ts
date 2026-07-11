/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { runViewTransition } from '@/utility/view-transition.js';

afterEach(() => {
	vi.restoreAllMocks();
});

function createTransition(finished: Promise<void>): ViewTransition {
	return {
		finished,
		ready: Promise.resolve(),
		types: new Set<string>() as ViewTransitionTypeSet,
		updateCallbackDone: Promise.resolve(),
		skipTransition: vi.fn(),
	};
}

describe('runViewTransition', () => {
	test('runs the update immediately when the API is unavailable', () => {
		const update = vi.fn();
		const document = {} as Document;

		expect(runViewTransition(update, document)).toBeNull();
		expect(update).toHaveBeenCalledTimes(1);
	});

	test('falls back when starting the transition throws', () => {
		const error = new Error('start failed');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const update = vi.fn();
		const document = {
			startViewTransition: vi.fn(() => {
				throw error;
			}),
		} as unknown as Document;

		expect(runViewTransition(update, document)).toBeNull();
		expect(update).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledWith(error);
	});

	test('does not repeat an update if starting throws after invoking it', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const update = vi.fn();
		const document = {
			startViewTransition: vi.fn((callback: () => void) => {
				callback();
				throw new Error('late failure');
			}),
		} as unknown as Document;

		runViewTransition(update, document);

		expect(update).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledTimes(1);
	});

	test('handles a rejected finished promise', async () => {
		const error = new Error('transition failed');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const update = vi.fn();
		const document = {
			startViewTransition: vi.fn((callback: () => void) => {
				callback();
				return createTransition(Promise.reject(error));
			}),
		} as unknown as Document;

		expect(runViewTransition(update, document)).not.toBeNull();
		await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(error));
		expect(update).toHaveBeenCalledTimes(1);
	});
});
