/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, suite, test } from 'vitest';
import { Release, ReleaseCategory } from '../src/parser';
import { checkNewRelease, checkNewTopic } from '../src/checker';

suite('checkNewRelease', () => {
	test.each([['1件', ['2024.12.1', '2024.12.0']]])('headに新しいリリースがある%s', (_count, versions) => {
		const base = [new Release('2024.12.0')];
		const head = versions.map((version) => new Release(version));

		const result = checkNewRelease(base, head);

		expect(result.success).toBe(true);
	});

	test('リリースの数が同じ', () => {
		const base = [new Release('2024.12.0')];
		const head = [new Release('2024.12.0')];

		const result = checkNewRelease(base, head);

		expect(result.success).toBe(false);
	});

	test('baseにあるリリースがheadにない', () => {
		const base = [new Release('2024.12.0')];
		const head = [new Release('2024.12.2'), new Release('2024.12.1')];

		const result = checkNewRelease(base, head);

		expect(result.success).toBe(false);
	});
});

suite('checkNewTopic', () => {
	// カテゴリ・項目の追加と削除は、どちらも件数の差として同じ分岐で判定される。
	test('追記なし', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
				new ReleaseCategory('Client', ['feat3', 'feat4']),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
				new ReleaseCategory('Client', ['feat3', 'feat4']),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
				new ReleaseCategory('Client', ['feat3', 'feat4']),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
				new ReleaseCategory('Client', ['feat3', 'feat4']),
			]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(true);
	});

	test('最新バージョンにカテゴリを追加したときはエラーにならない', () => {
		const base = [
			new Release('2024.12.1', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
				new ReleaseCategory('Client', ['feat3', 'feat4']),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
				new ReleaseCategory('Client', ['feat3', 'feat4']),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
				new ReleaseCategory('Client', ['feat3', 'feat4']),
			]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(true);
	});

	test('最新バージョンに追記したときはエラーにならない', () => {
		const base = [
			new Release('2024.12.1', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
			new Release('2024.12.0', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
		];

		const head = [
			new Release('2024.12.1', [new ReleaseCategory('Server', ['feat1', 'feat2', 'feat3'])]),
			new Release('2024.12.0', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(true);
	});

	test('古いバージョンにカテゴリを追加したときはエラーになる', () => {
		const base = [
			new Release('2024.12.1', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
			new Release('2024.12.0', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
		];

		const head = [
			new Release('2024.12.1', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
				new ReleaseCategory('Client', ['feat1', 'feat2']),
			]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(false);
	});

	test('古いバージョンに追記したときはエラーになる', () => {
		const base = [
			new Release('2024.12.1', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
			new Release('2024.12.0', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
		];

		const head = [
			new Release('2024.12.1', [new ReleaseCategory('Server', ['feat1', 'feat2'])]),
			new Release('2024.12.0', [new ReleaseCategory('Server', ['feat1', 'feat2', 'feat3'])]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(false);
	});
});
