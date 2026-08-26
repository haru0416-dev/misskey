/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { canvasToBlob, renderCanvasToBlob } from '@/utility/canvas-to-blob.js';

function createCanvas(result: Blob | null): HTMLCanvasElement {
	return {
		toBlob: (callback: BlobCallback) => callback(result),
	} as HTMLCanvasElement;
}

describe('canvasToBlob', () => {
	test('rejects when the browser returns null', async () => {
		await expect(canvasToBlob(createCanvas(null), 'image/png')).rejects.toThrow('Failed to convert canvas to blob');
	});
});

describe('renderCanvasToBlob', () => {
	test('returns the blob and destroys the renderer after success', async () => {
		const blob = new Blob(['image'], { type: 'image/png' });
		const destroy = vi.fn();
		await expect(renderCanvasToBlob(createCanvas(blob), async () => {}, destroy, 'image/png')).resolves.toBe(blob);
		expect(destroy).toHaveBeenCalledOnce();
	});

	test('always destroys the renderer when conversion fails', async () => {
		const destroy = vi.fn();
		await expect(renderCanvasToBlob(createCanvas(null), async () => {}, destroy, 'image/png')).rejects.toThrow();
		expect(destroy).toHaveBeenCalledOnce();
	});

	test('always destroys the renderer when rendering fails', async () => {
		const destroy = vi.fn();
		await expect(
			renderCanvasToBlob(
				createCanvas(new Blob()),
				async () => {
					throw new Error('render failed');
				},
				destroy,
				'image/png',
			),
		).rejects.toThrow('render failed');
		expect(destroy).toHaveBeenCalledOnce();
	});
});
