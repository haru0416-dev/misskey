/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import './init';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkLightboxItem, { calculatePinchScale, calculateSourceTransform, normalizeGestureTransform } from '@/features/media-viewer/components/MkLightbox.item.vue';
import MkLightbox from '@/features/media-viewer/components/MkLightbox.vue';
import MkImgWithBlurhash from '@/features/media-viewer/components/MkImgWithBlurhash.vue';
import MkMediaVideo from '@/features/media-viewer/components/MkMediaVideo.vue';
import { singleFlight } from '@/features/media-viewer/components/MkMediaList.vue';
import { makeDoubleTapDetector } from '@/features/media-viewer/double-tap.js';

describe('media lightbox', () => {
	afterEach(cleanup);

	test('calculates contain and cover transforms from the source rectangle', () => {
		const contentRenderingRect = { left: 100, top: 50, width: 400, height: 200 };
		const sourceRect = { left: 20, top: 30, width: 100, height: 100 };

		assert.deepEqual(calculateSourceTransform({ fit: 'contain', contentRenderingRect, sourceRect }), {
			x: -5,
			y: 42.5,
			scale: .25,
		});
		assert.deepEqual(calculateSourceTransform({ fit: 'cover', contentRenderingRect, sourceRect }), {
			x: -80,
			y: 5,
			scale: .5,
		});
	});

	test('normalizes invalid and sub-neutral gesture scales', () => {
		assert.deepEqual(normalizeGestureTransform({ x: 10, y: 20, scale: 1 }), { x: 0, y: 0, scale: 1 });
		assert.deepEqual(normalizeGestureTransform({ x: 10, y: 20, scale: -1 }), { x: 0, y: 0, scale: 1 });
		assert.deepEqual(normalizeGestureTransform({ x: 10, y: 20, scale: Number.NaN }), { x: 0, y: 0, scale: 1 });
		assert.ok(calculatePinchScale(1, -1000) > 0);
	});

	test('starts source animation from the original image without a thumbnail', async () => {
		const sourceElement = window.document.createElement('img');
		sourceElement.style.objectFit = 'contain';
		vi.spyOn(sourceElement, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 10, left: 10, top: 10, right: 110, bottom: 110, width: 100, height: 100, toJSON: () => ({}) });
		const result = render(MkLightboxItem, {
			props: {
				activated: true,
				content: { id: 'image', type: 'image', url: 'https://example.test/image.png', width: 400, height: 300, sourceElement },
			},
			global: { components, directives },
		});
		const image = result.container.querySelector('img[src="https://example.test/image.png"]');
		assert.ok(image instanceof HTMLImageElement);
		await fireEvent.load(image);
		await waitFor(() => assert.equal(sourceElement.style.visibility, 'hidden'));
		const transformer = image.closest('div[style*="transform"]');
		assert.ok(transformer instanceof HTMLDivElement);
		assert.match(transformer.style.transform, /translate\(0px, 0px\) scale\(1\)/);
	});

	test('places the source marker on the stable media wrapper', () => {
		const result = render(MkImgWithBlurhash, {
			props: { hash: null, src: 'https://example.test/image.png', marker: 'source' },
			global: { components, directives },
		});
		const marked = result.container.querySelectorAll('[data-marker="source"]');
		assert.equal(marked.length, 1);
		assert.equal(marked[0].tagName, 'DIV');
		assert.equal(marked[0].getAttribute('data-object-fit'), 'cover');
	});

	test('coalesces concurrent opens into one task', async () => {
		let resolve: (() => void) | undefined;
		const task = vi.fn((_id: string) => new Promise<void>(done => { resolve = done; }));
		const open = singleFlight(task);
		const first = open('first');
		const second = open('second');
		assert.equal(first, second);
		assert.equal(task.mock.calls.length, 1);
		resolve?.();
		await first;
		task.mockImplementation((_id: string) => Promise.resolve());
		await open('third');
		assert.equal(task.mock.calls.length, 2);
	});

	test('keeps video preview and operation buttons as sibling controls', () => {
		const result = render(MkMediaVideo, {
			props: {
				video: {
					id: 'video',
					createdAt: new Date().toJSON(),
					isSensitive: false,
					name: 'example.mp4',
					thumbnailUrl: 'https://example.test/thumbnail.png',
					url: 'https://example.test/example.mp4',
					type: 'video/mp4',
					size: 1,
					md5: '15eca7fba0480996e2245f5185bf39f2',
					blurhash: null,
					comment: null,
					properties: {},
					folderId: null,
					userId: null,
				},
			},
			global: { components, directives },
		});
		const buttons = result.container.querySelectorAll('button');
		assert.equal(buttons.length, 3);
		assert.equal(buttons[0].querySelectorAll('button').length, 0);
		assert.equal(buttons[0].parentElement, buttons[1].parentElement);
		assert.equal(buttons[0].parentElement, buttons[2].parentElement);
	});

	test('closes on Escape while a range input has focus', async () => {
		const result = render(MkLightbox, {
			props: { contents: [{ id: 'image', type: 'image', url: 'https://example.test/image.png' }] },
			global: { components, directives },
		});
		const dialog = result.getByRole('dialog');
		const range = window.document.createElement('input');
		range.type = 'range';
		dialog.appendChild(range);
		range.focus();
		await fireEvent.keyDown(range, { key: 'Escape' });
		await waitFor(() => assert.equal(dialog.style.display, 'none'));
	});

	test('restores dialog focus when the navigation button disappears', async () => {
		const result = render(MkLightbox, {
			props: {
				contents: [
					{ id: 'first', type: 'image', url: 'https://example.test/first.png' },
					{ id: 'second', type: 'image', url: 'https://example.test/second.png' },
				],
			},
			global: { components, directives },
		});
		const dialog = result.getByRole('dialog');
		const next = result.getByRole('button', { name: 'Next' });
		next.focus();
		await fireEvent.click(next);
		await waitFor(() => assert.equal(window.document.activeElement, dialog));
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => assert.equal(dialog.style.display, 'none'));
	});

	test('restores dialog focus when the focused slide becomes inert', async () => {
		const result = render(MkLightbox, {
			props: {
				contents: [
					{ id: 'first', type: 'image', url: 'https://example.test/first.png' },
					{ id: 'second', type: 'image', url: 'https://example.test/second.png' },
				],
			},
			global: { components, directives },
		});
		const dialog = result.getByRole('dialog');
		const menu = result.getByRole('button', { name: 'Menu' });
		menu.focus();
		await fireEvent.keyDown(menu, { key: 'ArrowRight' });
		await waitFor(() => assert.equal(window.document.activeElement, dialog));
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => assert.equal(dialog.style.display, 'none'));
	});

	test('detects nearby taps and resets after movement', () => {
		const callback = vi.fn();
		const detector = makeDoubleTapDetector(callback);
		const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] }) as unknown as TouchEvent;
		const now = vi.spyOn(Date, 'now');

		now.mockReturnValueOnce(1000).mockReturnValueOnce(1200);
		detector.onTouchstart(touch(10, 10));
		detector.onTouchstart(touch(15, 15));
		assert.equal(callback.mock.calls.length, 1);

		now.mockReturnValueOnce(2000).mockReturnValueOnce(2200);
		detector.onTouchstart(touch(10, 10));
		detector.onTouchmove(touch(30, 10));
		detector.onTouchstart(touch(10, 10));
		assert.equal(callback.mock.calls.length, 1);
	});
});
