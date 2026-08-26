/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { visitHome } from '../support/helpers.js';

/**
 * 圧縮処理は `createImageBitmap` / `OffscreenCanvas` に依存するため jsdom では動かせず、
 * frontend の vitest からは寸法計算しか検証できない。実ブラウザへソースを持ち込んで当てる。
 */
// Playwright は spec を CJS へ落とすので import.meta が使えない。
const modulePath = path.join(__dirname, '../../../packages/frontend/src/features/drive/image-compression.ts');

type Compression = typeof import('../../../packages/frontend/src/features/drive/image-compression.js');

declare global {
	interface Window {
		__imageCompression: Compression;
	}
}

let bundle: string;

test.beforeAll(() => {
	// 引数は変数に出す。インライン配列だと knip が `bun build` を package.json の
	// build スクリプト呼び出しと誤解し、その中身を未解決 import として報告する。
	const args = ['build', modulePath, '--target=browser', '--format=esm'];
	bundle = execFileSync('bun', args, {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});
});

async function loadModule(page: Page): Promise<void> {
	await visitHome(page);
	await page.evaluate(async (code) => {
		const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
		try {
			window.__imageCompression = await import(/* @vite-ignore */ url);
		} finally {
			URL.revokeObjectURL(url);
		}
	}, bundle);
}

/** 指定寸法の PNG を作る。縮小の質を見たいので高周波成分を入れる。 */
async function makeSource(page: Page, width: number, height: number, pattern: 'checker' | 'photo'): Promise<void> {
	await page.evaluate(
		async ({ width, height, pattern }) => {
			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext('2d')!;
			const image = ctx.createImageData(width, height);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const i = (y * width + x) * 4;
					const v =
						pattern === 'checker' ? ((x + y) % 2 === 0 ? 255 : 0) : Math.sin(x / 7) * 60 + Math.cos(y / 11) * 60 + 128;
					image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
					image.data[i + 3] = 255;
				}
			}
			ctx.putImageData(image, 0, 0);
			(window as unknown as { __source: Blob }).__source = await canvas.convertToBlob({ type: 'image/png' });
		},
		{ width, height, pattern },
	);
}

async function measure(
	page: Page,
	maxSize: number,
): Promise<{ width: number; height: number; type: string; stdDev: number }> {
	return page.evaluate(async (maxSize) => {
		const source = (window as unknown as { __source: Blob }).__source;
		const out = await window.__imageCompression.readAndCompressImage(source, {
			maxWidth: maxSize,
			maxHeight: maxSize,
			mimeType: 'image/webp',
			quality: 0.9,
		});
		const bitmap = await createImageBitmap(out);
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
		const { data } = canvas.getContext('2d')!.getImageData(0, 0, bitmap.width, bitmap.height);
		let sum = 0;
		let sumSq = 0;
		const n = data.length / 4;
		for (let i = 0; i < data.length; i += 4) {
			sum += data[i]!;
			sumSq += data[i]! * data[i]!;
		}
		const mean = sum / n;
		return {
			width: bitmap.width,
			height: bitmap.height,
			type: out.type,
			stdDev: Math.sqrt(Math.max(0, sumSq / n - mean * mean)),
		};
	}, maxSize);
}

test.describe('画像圧縮', () => {
	test('上限を超える画像は縦横比を保って縮小され、指定の形式で返る', async ({ page }) => {
		await loadModule(page);
		await makeSource(page, 2016, 1512, 'photo');

		const result = await measure(page, 1000);

		expect(result.width).toBe(1000);
		expect(result.height).toBe(750);
		expect(result.type).toBe('image/webp');
	});

	test('上限より小さい画像は拡大されない', async ({ page }) => {
		await loadModule(page);
		await makeSource(page, 640, 480, 'photo');

		const result = await measure(page, 2000);

		expect(result.width).toBe(640);
		expect(result.height).toBe(480);
	});

	test('低品質のリサンプラに落ちていない', async ({ page }) => {
		// 1px 市松模様を縮小すると、前置フィルタが効いていれば残る模様が弱まる。
		// 実測 (Chromium): 2048 -> 1000 で resizeQuality 'high' は標準偏差 19.8、'low' は 42.5。
		// 縮小率を大きくすると 'low' でも一様な灰色になって差が消えるので、実際の
		// アップロード設定 (4032px 幅を 2000/1500/1125 へ) に近い 2 倍前後で見る。
		await loadModule(page);
		await makeSource(page, 2048, 2048, 'checker');

		const result = await measure(page, 1000);

		expect(result.stdDev).toBeLessThan(30);
	});
});
