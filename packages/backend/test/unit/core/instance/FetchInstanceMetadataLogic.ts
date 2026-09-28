/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { parseCssColorToHex } from '@/core/instance/FetchInstanceMetadataLogic.js';

// リモートのテーマ色の変換。hsl は丸め方で 1 ずれやすいので、境目に当たる値を固定で持つ。
describe('core:instance:parseCssColorToHex', () => {
	test.each([
		['#abc', '#aabbcc'],
		['#AABBCC', '#aabbcc'],
		['#aabbccdd', '#aabbcc'],
		['rgb(10, 20, 30)', '#0a141e'],
		['rgba(10,20,30,0.4)', '#0a141e'],
		['rgb(300, 0, 0)', '#ff0000'],
		['hsl(0, 20%, 12.5%)', '#261a1a'],
		['hsl(0, 80%, 50%)', '#e61919'],
		['hsl(1, 80%, 50%)', '#e61d19'],
		['hsl(210deg, 40%, 60%)', '#7099c2'],
		['hsla(120, 50%, 50%, 0.5)', '#40bf40'],
		['hsl(0, 0%, 50%)', '#808080'],
		// 範囲外は CSS どおり丸める (明度 100% 超は白、色相は 360 の剰余)。
		['hsl(0, 50%, 150%)', '#ffffff'],
		['hsl(480, 50%, 50%)', '#40bf40'],
		[' Red ', '#ff0000'],
		['rebeccapurple', '#663399'],
		['aliceblue', '#f0f8ff'],
		['darkslategray', '#2f4f4f'],
	])('%s → %s', (input, expected) => {
		expect(parseCssColorToHex(input)).toBe(expected);
	});

	// '#rrggbb' にならない色名・意味の違う色名・CSS の他の書式は受けない。
	test.each([
		'transparent',
		'currentcolor',
		'canvas',
		'buttontext',
		'inherit',
		'oklch(0.7 0.1 200)',
		'notacolor',
		'',
		'rgb(1,2)',
	])('%s → null', (input) => {
		expect(parseCssColorToHex(input)).toBeNull();
	});
});
