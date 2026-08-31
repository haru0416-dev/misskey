/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import * as upstream from 'blurhash';
import sharp from 'sharp';
import { encodeBlurhash } from '@/core/drive/blurhash-encode.js';

const resources = `${dirname(fileURLToPath(import.meta.url))}/../../../resources`;

async function loadPixels(file: string): Promise<{ pixels: Buffer; width: number; height: number }> {
	const { data, info } = await sharp(`${resources}/${file}`)
		.raw()
		.ensureAlpha()
		.resize(64, 64, { fit: 'inside' })
		.toBuffer({ resolveWithObject: true });
	return { pixels: data, width: info.width, height: info.height };
}

describe('encodeBlurhash', () => {
	// 参照実装は blurhash パッケージ。FileInfoService と同じ 64×64 縮小・5×5 成分で比較する
	test.each(['192.jpg', '192.png', 'anime.png', 'hw.png', 'rotate.jpg', 'with-alpha.png', 'without-alpha.webp'])(
		'matches upstream for %s',
		async (file) => {
			const { pixels, width, height } = await loadPixels(file);
			expect(encodeBlurhash(pixels, width, height, 5, 5)).toBe(
				upstream.encode(new Uint8ClampedArray(pixels), width, height, 5, 5),
			);
		},
	);

	test('matches upstream for arbitrary pixels, sizes and component counts', () => {
		let runs = 0;
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 40 }),
				fc.integer({ min: 1, max: 40 }),
				fc.integer({ min: 1, max: 9 }),
				fc.integer({ min: 1, max: 9 }),
				fc.integer({ min: 0, max: 0xffffffff }),
				(width, height, cx, cy, seed) => {
					// xorshift で決定的にピクセルを埋める (fc.uint8Array だと縮小時に長さの制約が壊れる)
					let s = seed || 1;
					const pixels = new Uint8ClampedArray(width * height * 4);
					for (let i = 0; i < pixels.length; i++) {
						s ^= s << 13;
						s ^= s >>> 17;
						s ^= s << 5;
						pixels[i] = s & 255;
					}
					runs++;
					expect(encodeBlurhash(pixels, width, height, cx, cy)).toBe(upstream.encode(pixels, width, height, cx, cy));
				},
			),
			{ numRuns: 300 },
		);
		expect(runs).toBe(300);
	});

	test('rejects component counts outside 1..9 and mismatched pixel length', () => {
		const pixels = new Uint8ClampedArray(4 * 4 * 4);
		expect(() => encodeBlurhash(pixels, 4, 4, 0, 5)).toThrow('between 1 and 9');
		expect(() => encodeBlurhash(pixels, 4, 4, 5, 10)).toThrow('between 1 and 9');
		expect(() => encodeBlurhash(pixels, 4, 3, 5, 5)).toThrow('must match');
	});

	test('is at least 3x faster than upstream on a 64x64 image', async () => {
		const { pixels, width, height } = await loadPixels('192.jpg');
		const clamped = new Uint8ClampedArray(pixels);
		const measure = (fn: () => string): number => {
			for (let i = 0; i < 50; i++) fn();
			const start = performance.now();
			for (let i = 0; i < 200; i++) fn();
			return (performance.now() - start) / 200;
		};
		const upstreamMs = measure(() => upstream.encode(clamped, width, height, 5, 5));
		const inhouseMs = measure(() => encodeBlurhash(pixels, width, height, 5, 5));
		expect(inhouseMs * 3).toBeLessThan(upstreamMs);
	});
});
