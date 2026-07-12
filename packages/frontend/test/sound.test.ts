/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/preferences.js', () => ({
	prefer: {},
}));

vi.mock('@/preferences/store.js', () => ({
	getInitialPrefValue: vi.fn(),
}));

import { getSoundDuration, loadAudio } from '@/features/sound/sound.js';

describe('sound utilities', () => {
	const decodeAudioData = vi.fn();

	beforeEach(() => {
		decodeAudioData.mockReset();
		vi.stubGlobal(
			'AudioContext',
			class {
				public decodeAudioData = decodeAudioData;
				public close() {}
			},
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test('shares an in-flight fetch and decode for the same URL', async () => {
		const buffer = {} as AudioBuffer;
		decodeAudioData.mockResolvedValue(buffer);
		const fetch = vi.fn().mockResolvedValue({
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
		});
		vi.stubGlobal('fetch', fetch);

		const [first, second] = await Promise.all([loadAudio('/audio/shared.mp3'), loadAudio('/audio/shared.mp3')]);

		expect(first).toBe(buffer);
		expect(second).toBe(buffer);
		expect(fetch).toHaveBeenCalledOnce();
		expect(decodeAudioData).toHaveBeenCalledOnce();
	});

	test('reads duration from metadata events without polling', async () => {
		const setInterval = vi.spyOn(window, 'setInterval');
		vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) {
			Object.defineProperty(this, 'duration', { value: 2.5, configurable: true });
			this.dispatchEvent(new Event('loadedmetadata'));
		});

		await expect(getSoundDuration('/audio/metadata.mp3')).resolves.toBe(2500);
		expect(setInterval).not.toHaveBeenCalled();
	});
});
