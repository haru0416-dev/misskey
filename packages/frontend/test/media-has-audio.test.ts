/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import hasAudio from '@/features/media-viewer/media-has-audio.js';

describe('hasAudio', () => {
	test('settles and releases the clone when playback is rejected', async () => {
		const media = window.document.createElement('video');
		const cloned = window.document.createElement('video');
		vi.spyOn(media, 'cloneNode').mockReturnValue(cloned);
		vi.spyOn(cloned, 'play').mockRejectedValue(new DOMException('Blocked', 'NotAllowedError'));
		const pause = vi.spyOn(cloned, 'pause');
		const load = vi.spyOn(cloned, 'load');

		await expect(hasAudio(media)).resolves.toBe(false);
		expect(pause).toHaveBeenCalledOnce();
		expect(load).toHaveBeenCalledOnce();
	});

	test('detects decoded audio after playback starts', async () => {
		const media = window.document.createElement('video');
		const cloned = window.document.createElement('video');
		Object.defineProperty(cloned, 'webkitAudioDecodedByteCount', { value: 1 });
		vi.spyOn(media, 'cloneNode').mockReturnValue(cloned);
		vi.spyOn(cloned, 'play').mockImplementation(async () => {
			queueMicrotask(() => cloned.dispatchEvent(new Event('playing')));
		});

		await expect(hasAudio(media)).resolves.toBe(true);
	});
});
