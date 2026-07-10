/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import './init';
import * as Misskey from 'misskey-js';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkMediaVideo from '@/components/MkMediaVideo.vue';

vi.mock('@/utility/media-has-audio.js', () => ({
	default: () => Promise.resolve(true),
}));

const videoFile = {
	id: 'xxxxxxxx',
	createdAt: new Date().toJSON(),
	isSensitive: false,
	name: 'example.mp4',
	thumbnailUrl: null,
	url: 'https://example.test/example.mp4',
	type: 'video/mp4',
	size: 1,
	md5: '15eca7fba0480996e2245f5185bf39f2',
	blurhash: null,
	comment: null,
	properties: {},
} as Misskey.entities.DriveFile;

describe('MkMediaVideo', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
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

		const result = render(MkMediaVideo, {
			props: { video: videoFile },
			global: { directives, components },
		});

		const video = await waitFor(() => {
			const element = result.container.querySelector('video');
			assert.ok(element instanceof HTMLVideoElement);
			return element;
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
});
