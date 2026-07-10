/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { IdlingRenderScheduler } from '@/utility/idle-render.js';

function createIdleCallbacks() {
	let idleId = 0;
	const callbacks = new Map<number, IdleRequestCallback>();
	const request = vi.fn((callback: IdleRequestCallback) => {
		const id = ++idleId;
		callbacks.set(id, callback);
		return id;
	}) as typeof window.requestIdleCallback;
	const cancel = vi.fn((id: number) => {
		callbacks.delete(id);
	}) as typeof window.cancelIdleCallback;
	const runNext = (timeRemaining: number) => {
		const [id, callback] = callbacks.entries().next().value!;
		callbacks.delete(id);
		callback({
			didTimeout: false,
			timeRemaining: () => timeRemaining,
		});
	};
	return { callbacks, request, cancel, runNext };
}

describe('IdlingRenderScheduler', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('runs only with subscribers and keeps at most one idle or frame request pending', () => {
		let hidden = false;
		vi.spyOn(window.document, 'hidden', 'get').mockImplementation(() => hidden);
		const idle = createIdleCallbacks();
		let frameId = 0;
		const frames = new Map<number, FrameRequestCallback>();
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			const id = ++frameId;
			frames.set(id, callback);
			return id;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
			frames.delete(id);
		});
		const scheduler = new IdlingRenderScheduler(idle.request, idle.cancel);
		const firstRenderer = vi.fn();
		const secondRenderer = vi.fn();

		expect(idle.callbacks.size).toBe(0);
		scheduler.add(firstRenderer);
		scheduler.add(firstRenderer);
		scheduler.add(secondRenderer);
		expect(idle.callbacks.size).toBe(1);
		expect(frames.size).toBe(0);

		idle.runNext(10);
		expect(idle.callbacks.size).toBe(0);
		expect(frames.size).toBe(1);

		const [id, frame] = frames.entries().next().value!;
		frames.delete(id);
		frame(16);
		expect(firstRenderer).toHaveBeenCalledOnce();
		expect(secondRenderer).toHaveBeenCalledOnce();
		expect(idle.callbacks.size).toBe(1);
		expect(frames.size).toBe(0);

		hidden = true;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(idle.callbacks.size).toBe(0);
		expect(frames.size).toBe(0);

		hidden = false;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(idle.callbacks.size).toBe(1);

		scheduler.delete(firstRenderer);
		expect(idle.callbacks.size).toBe(1);
		scheduler.delete(secondRenderer);
		expect(idle.callbacks.size).toBe(0);

		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(idle.callbacks.size).toBe(0);
		scheduler.dispose();
	});

	test('retries idle periods without time and becomes inert after disposal', () => {
		vi.spyOn(window.document, 'hidden', 'get').mockReturnValue(false);
		const idle = createIdleCallbacks();
		const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame');
		const scheduler = new IdlingRenderScheduler(idle.request, idle.cancel);
		const renderer = vi.fn();

		scheduler.add(renderer);
		idle.runNext(0);
		expect(requestAnimationFrame).not.toHaveBeenCalled();
		expect(idle.callbacks.size).toBe(1);

		scheduler.dispose();
		expect(idle.callbacks.size).toBe(0);
		scheduler.add(renderer);
		expect(idle.callbacks.size).toBe(0);
	});
});
