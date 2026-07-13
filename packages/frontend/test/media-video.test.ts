/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import './init';
import { ref } from 'vue';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import { DI } from '@/di.js';
import MkVideoControl from '@/features/media-viewer/components/MkVideoControl.vue';

const hasAudioState = vi.hoisted(() => ({ implementation: () => Promise.resolve(true) }));
vi.mock('@/features/media-viewer/media-has-audio.js', () => ({ default: () => hasAudioState.implementation() }));

describe('MkVideoControl', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		hasAudioState.implementation = () => Promise.resolve(true);
	});

	test('runs animation frames only while playing and cancels them on unmount', async () => {
		let frameId = 0;
		const frames = new Map<number, FrameRequestCallback>();
		const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			const id = ++frameId;
			frames.set(id, callback);
			return id;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
			frames.delete(id);
		});

		const video = window.document.createElement('video');
		const result = render(MkVideoControl, {
			global: {
				directives,
				components,
				provide: { [DI.mkLightboxItemVideoEl as symbol]: ref(video) },
			},
		});

		assert.equal(requestAnimationFrame.mock.calls.length, 0);

		let paused = false;
		Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
		Object.defineProperty(video, 'ended', { configurable: true, get: () => false });
		video.dispatchEvent(new Event('play'));
		assert.equal(frames.size, 0);
		video.dispatchEvent(new Event('playing'));

		assert.equal(frames.size, 1);
		const [id, callback] = frames.entries().next().value!;
		frames.delete(id);
		callback(16);
		assert.equal(frames.size, 1);

		video.dispatchEvent(new Event('waiting'));
		assert.equal(frames.size, 0);
		video.dispatchEvent(new Event('playing'));
		assert.equal(frames.size, 1);

		paused = true;
		video.dispatchEvent(new Event('pause'));
		assert.equal(frames.size, 0);

		paused = false;
		video.dispatchEvent(new Event('play'));
		video.dispatchEvent(new Event('playing'));
		assert.equal(frames.size, 1);

		result.unmount();
		assert.equal(frames.size, 0);
	});

	test('recovers state when play is rejected', async () => {
		const video = window.document.createElement('video');
		const play = vi.spyOn(video, 'play').mockRejectedValue(new DOMException('blocked'));
		const result = render(MkVideoControl, {
			global: {
				directives,
				components,
				provide: { [DI.mkLightboxItemVideoEl as symbol]: ref(video) },
			},
		});

		const button = result.container.querySelector('button');
		assert.ok(button instanceof HTMLButtonElement);
		button.click();
		assert.equal(play.mock.calls.length, 1);
		await waitFor(() => assert.match(button.innerHTML, /player-play/));
	});

	test('does not autoplay after hasAudio resolves for an inactive item', async () => {
		let resolveHasAudio: ((value: boolean) => void) | undefined;
		hasAudioState.implementation = () =>
			new Promise((resolve) => {
				resolveHasAudio = resolve;
			});
		const video = window.document.createElement('video');
		const play = vi.spyOn(video, 'play').mockResolvedValue();
		const pause = vi.spyOn(video, 'pause');
		const active = ref(true);
		const result = render(MkVideoControl, {
			global: {
				directives,
				components,
				provide: {
					[DI.mkLightboxItemVideoEl as symbol]: ref(video),
					[DI.mkLightboxItemActive as symbol]: active,
				},
			},
		});

		active.value = false;
		await waitFor(() => assert.equal(pause.mock.calls.length, 1));
		resolveHasAudio?.(false);
		await Promise.resolve();
		assert.equal(play.mock.calls.length, 0);
		result.unmount();
	});
});
