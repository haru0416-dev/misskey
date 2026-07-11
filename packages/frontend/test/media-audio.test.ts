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
import MkMediaAudio from '@/features/media-viewer/components/MkMediaAudio.vue';

const audioFile = {
	id: 'xxxxxxxx',
	createdAt: new Date().toJSON(),
	isSensitive: false,
	name: 'example.mp3',
	thumbnailUrl: null,
	url: 'https://example.test/example.mp3',
	type: 'audio/mpeg',
	size: 1,
	md5: '15eca7fba0480996e2245f5185bf39f2',
	blurhash: null,
	comment: null,
	properties: {},
} as Misskey.entities.DriveFile;

describe('MkMediaAudio', () => {
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

		const result = render(MkMediaAudio, {
			props: { audio: audioFile },
			global: { directives, components },
		});

		const audio = await waitFor(() => {
			const element = result.container.querySelector('audio');
			assert.ok(element instanceof HTMLAudioElement);
			return element;
		});

		assert.equal(requestAnimationFrame.mock.calls.length, 0);

		let paused = false;
		Object.defineProperty(audio, 'paused', { configurable: true, get: () => paused });
		Object.defineProperty(audio, 'ended', { configurable: true, get: () => false });
		audio.dispatchEvent(new Event('play'));

		assert.equal(frames.size, 1);
		const [id, callback] = frames.entries().next().value!;
		frames.delete(id);
		callback(16);
		assert.equal(frames.size, 1);

		paused = true;
		audio.dispatchEvent(new Event('pause'));
		assert.equal(frames.size, 0);

		paused = false;
		audio.dispatchEvent(new Event('play'));
		assert.equal(frames.size, 1);

		result.unmount();
		assert.equal(frames.size, 0);
	});
});
