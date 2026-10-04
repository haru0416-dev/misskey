/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { correctFilename } from '@/misc/correct-filename.js';

describe(correctFilename, () => {
	test('no ext to null', () => {
		expect(correctFilename('ファイル 名前', null)).toBe('ファイル 名前.unknown');
	});
	test('jpg to webp', () => {
		expect(correctFilename('test.jpg', 'webp')).toBe('test.jpg.webp');
	});
	test('jpg to .webp', () => {
		expect(correctFilename('test.jpg', '.webp')).toBe('test.jpg.webp');
	});
	test('JPEG to jpg', () => {
		expect(correctFilename('test.JPEG', 'jpg')).toBe('test.JPEG');
	});
	test('tiff to tif', () => {
		expect(correctFilename('test.tiff', 'tif')).toBe('test.tiff');
	});
	test('skip gz', () => {
		expect(correctFilename('test.unitypackage', 'gz')).toBe('test.unitypackage');
	});
	test('skip text file', () => {
		expect(correctFilename('test.txt', null)).toBe('test.txt');
	});

	// dll と exe はどちらも portable executable で file-type が判別しきれない。
	test('dll to exe', () => {
		expect(correctFilename('test.dll', 'exe')).toBe('test.dll');
	});

	// 拡張子の判定は末尾だけを見る。途中のドットを拾うと二重付与になる。
	test('multiple dots, matching last ext', () => {
		expect(correctFilename('test.tar.JPG', 'jpg')).toBe('test.tar.JPG');
	});
});
