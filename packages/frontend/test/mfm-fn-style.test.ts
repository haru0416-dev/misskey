/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { mfmFnStyle } from '@shared/utility/mfm-fn-style.js';

const on = { useAnim: true, advanced: true };
const off = { useAnim: false, advanced: false };

describe('mfmFnStyle', () => {
	test('アニメーションなしでは動きの指定を落とし、拡大などの見た目は残す', () => {
		expect(mfmFnStyle('tada', {}, off)).toStrictEqual({ style: { fontSize: '150%' } });
		expect(mfmFnStyle('spin', { left: true }, off)).toStrictEqual({ style: {} });
		expect(mfmFnStyle('flip', { v: true }, off)).toStrictEqual({ style: { transform: 'scaleY(-1)' } });
	});

	test('rainbow はアニメーションなしなら呼び出し側の代替表示に任せる', () => {
		expect(mfmFnStyle('rainbow', {}, off)).toBeNull();
		expect(mfmFnStyle('rainbow', { speed: '2s' }, on)).toStrictEqual({
			style: { animation: 'mfm-rainbow 2s linear infinite', animationDelay: '0s' },
		});
	});

	test('装飾が無効なら position は原文のまま、scale は拡大しない', () => {
		expect(mfmFnStyle('position', { x: '1' }, off)).toStrictEqual({ style: undefined });
		expect(mfmFnStyle('scale', { x: '3' }, off)).toStrictEqual({ style: {} });
		expect(mfmFnStyle('scale', { x: '9', y: '2' }, on)).toStrictEqual({
			style: { transform: 'scale(5, 2)' },
			scaleFactor: 5,
		});
	});

	test('不正な値は既定値に置き換え、未知の関数と要素を変える関数は扱わない', () => {
		expect(mfmFnStyle('jump', { speed: '1 s; color: red' }, on)?.style).toMatchObject({
			animation: 'mfm-jump 0.75s linear infinite',
		});
		expect(mfmFnStyle('fg', { color: 'red' }, on)?.style).toMatchObject({ color: '#f00' });
		expect(mfmFnStyle('border', { style: 'evil', noclip: true }, on)?.style).toStrictEqual({
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--MI_THEME-accent)',
			borderRadius: '0px',
		});
		expect(mfmFnStyle('font', {}, on)).toStrictEqual({ style: undefined });
		for (const name of ['x2', 'blur', 'ruby', 'unixtime', 'clickable', 'unknown'])
			expect(mfmFnStyle(name, {}, on)).toBeNull();
	});
});
