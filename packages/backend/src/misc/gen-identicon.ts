/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createCanvas } from '@napi-rs/canvas';

// deterministic PRNG (xmur3 hash + mulberry32), replaces the unmaintained random-seed package
function createSeededRandom(seed: string): (max: number) => number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	let a = h;
	return (max: number) => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
	};
}

const size = 128; // px
const n = 5; // resolution
const margin = size / 4;
const colors: readonly (readonly [string, string])[] = [
	['#FF512F', '#DD2476'],
	['#FF61D2', '#FE9090'],
	['#72FFB6', '#10D164'],
	['#FD8451', '#FFBD6F'],
	['#305170', '#6DFC6B'],
	['#00C0FF', '#4218B8'],
	['#009245', '#FCEE21'],
	['#0100EC', '#FB36F4'],
	['#FDABDD', '#374A5A'],
	['#38A2D7', '#561139'],
	['#121C84', '#8278DA'],
	['#5761B2', '#1FC5A8'],
	['#FFDB01', '#0E197D'],
	['#FF3E9D', '#0E1F40'],
	['#766eff', '#00d4ff'],
	['#9bff6e', '#00d4ff'],
	['#ff6e94', '#00d4ff'],
	['#ffa96e', '#00d4ff'],
	['#ffa96e', '#ff009d'],
	['#ffdd6e', '#ff009d'],
];

const actualSize = size - margin * 2;
const cellSize = actualSize / n;
const sideN = Math.floor(n / 2);

export async function genIdenticon(seed: string): Promise<Buffer> {
	const rand = createSeededRandom(seed);
	const canvas = createCanvas(size, size);
	const ctx = canvas.getContext('2d');

	const bgColors = colors[rand(colors.length)];
	if (bgColors == null) throw new Error('Identicon color palette is empty');

	const bg = ctx.createLinearGradient(0, 0, size, size);
	bg.addColorStop(0, bgColors[0]);
	bg.addColorStop(1, bgColors[1]);

	ctx.fillStyle = bg;
	ctx.beginPath();
	ctx.fillRect(0, 0, size, size);

	ctx.fillStyle = '#ffffff';

	const side: boolean[][] = new Array(sideN);
	for (let i = 0; i < side.length; i++) {
		side[i] = new Array(n).fill(false);
	}

	const center: boolean[] = new Array(n).fill(false);

	// eslint:disable-next-line:prefer-for-of
	for (let x = 0; x < side.length; x++) {
		const column = side[x];
		if (column == null) continue;
		for (let y = 0; y < column.length; y++) {
			column[y] = rand(3) === 0;
		}
	}

	for (let i = 0; i < center.length; i++) {
		center[i] = rand(3) === 0;
	}

	for (let x = 0; x < n; x++) {
		for (let y = 0; y < n; y++) {
			const isXCenter = x === (n - 1) / 2;
			if (isXCenter && !center[y]) continue;

			const isLeftSide = x < (n - 1) / 2;
			if (isLeftSide && !side[x]?.[y]) continue;

			const isRightSide = x > (n - 1) / 2;
			if (isRightSide && !side[sideN - (x - sideN)]?.[y]) continue;

			const actualX = margin + cellSize * x;
			const actualY = margin + cellSize * y;
			ctx.beginPath();
			ctx.fillRect(actualX, actualY, cellSize, cellSize);
		}
	}

	return await canvas.encode('png');
}
