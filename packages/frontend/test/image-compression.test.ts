/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { calculateTargetSize } from '@/features/drive/image-compression.js';

describe('calculateTargetSize', () => {
	const level1 = { maxWidth: 2000, maxHeight: 2000 };

	test('元より小さい指定でだけ縮む', () => {
		expect(calculateTargetSize(4032, 3024, level1)).toStrictEqual({ width: 2000, height: 1500 });
	});

	test('上限より小さい画像は拡大しない', () => {
		expect(calculateTargetSize(800, 600, level1)).toStrictEqual({ width: 800, height: 600 });
	});

	test('縦長は maxHeight 側で決まる', () => {
		// 3024x4032 を 2000x2000 に収めると、高さが先に上限へ当たる
		expect(calculateTargetSize(3024, 4032, level1)).toStrictEqual({ width: 1500, height: 2000 });
	});

	test('どの入力でも上限を超えず、拡大せず、縦横比を保つ', () => {
		// 高さ側のクランプを置いていないので、上限を超えないことは幅の選び方だけで
		// 成り立っている必要がある。乱数を含む広い範囲で確かめる。
		let seed = 20260826;
		const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n) + 1;
		const sizes: [number, number][] = [
			[4032, 3024],
			[1920, 1080],
			[3000, 4000],
			[5000, 1000],
			[1001, 997],
			[1, 4000],
			[4000, 1],
		];
		for (let i = 0; i < 300; i++) sizes.push([rnd(6000), rnd(6000)]);

		const limits: [number, number][] = [
			[2000, 2000],
			[1500, 1500],
			[1125, 1125],
			[1200, 800],
		];

		for (const [maxWidth, maxHeight] of limits) {
			for (const [w, h] of sizes) {
				const target = calculateTargetSize(w, h, { maxWidth, maxHeight });
				expect(target.width).toBeLessThanOrEqual(maxWidth);
				expect(target.height).toBeLessThanOrEqual(maxHeight);
				expect(target.width).toBeLessThanOrEqual(w);
				expect(target.height).toBeLessThanOrEqual(h);
				// canvas は 0 辺を作れない
				expect(target.width).toBeGreaterThanOrEqual(1);
				expect(target.height).toBeGreaterThanOrEqual(1);
				// 縦横比は floor の1px以内で保たれる。ただし辺が1へ張り付いた場合は
				// それ以上細くできないので比は保てない (1x4000 を 2000 幅に収める等)。
				if (target.width > 1 && target.height > 1) {
					const idealHeight = h * (target.width / w);
					expect(Math.abs(target.height - idealHeight)).toBeLessThanOrEqual(1);
				}
			}
		}
	});

	test('正方形は両辺とも上限に張り付く', () => {
		expect(calculateTargetSize(3000, 3000, level1)).toStrictEqual({ width: 2000, height: 2000 });
	});
});
