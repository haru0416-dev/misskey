/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { correctFilename } from '@/misc/correct-filename.js';

describe(correctFilename, () => {
	test('no ext to null', () => {
		expect(correctFilename('test', null)).toBe('test.unknown');
	});
	test('no ext to jpg', () => {
		expect(correctFilename('test', 'jpg')).toBe('test.jpg');
	});
	test('jpg to webp', () => {
		expect(correctFilename('test.jpg', 'webp')).toBe('test.jpg.webp');
	});
	test('jpg to .webp', () => {
		expect(correctFilename('test.jpg', '.webp')).toBe('test.jpg.webp');
	});
	test('jpeg to jpg', () => {
		expect(correctFilename('test.jpeg', 'jpg')).toBe('test.jpeg');
	});
	test('JPEG to jpg', () => {
		expect(correctFilename('test.JPEG', 'jpg')).toBe('test.JPEG');
	});
	test('jpg to jpg', () => {
		expect(correctFilename('test.jpg', 'jpg')).toBe('test.jpg');
	});
	test('JPG to jpg', () => {
		expect(correctFilename('test.JPG', 'jpg')).toBe('test.JPG');
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
	test('unknown', () => {
		expect(correctFilename('test.hoge', null)).toBe('test.hoge');
	});
	test('non ascii with space', () => {
		expect(correctFilename('ファイル 名前', 'jpg')).toBe('ファイル 名前.jpg');
	});

	// dll と exe はどちらも portable executable で file-type が判別しきれない。
	test('dll to exe', () => {
		expect(correctFilename('test.dll', 'exe')).toBe('test.dll');
	});

	// 拡張子の判定は末尾だけを見る。途中のドットを拾うと二重付与になる。
	test('multiple dots, matching last ext', () => {
		expect(correctFilename('test.tar.jpg', 'jpg')).toBe('test.tar.jpg');
	});
});
