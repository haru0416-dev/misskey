/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { makeHotkey } from '@/utility/hotkey.js';

function setup() {
	const host = document.createElement('article');
	host.tabIndex = 0;
	const button = document.createElement('button');
	const plain = document.createElement('span');
	host.append(button, plain);
	document.body.append(host);
	const onEnter = vi.fn();
	const onSpace = vi.fn();
	const onM = vi.fn();
	// 同じキーの 500ms 以内の連打を捨てる仕組みがあるため、Enter は続けて押せるようにする
	host.addEventListener(
		'keydown',
		makeHotkey({ enter: { callback: onEnter, allowRepeat: true }, space: onSpace, m: onM }),
	);
	return { host, button, plain, onEnter, onSpace, onM };
}

function press(target: Element, key: string) {
	const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	target.dispatchEvent(ev);
	return ev;
}

describe('makeHotkey', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	test('leaves Enter and Space to a focused button inside the element', () => {
		const { button, onEnter, onSpace } = setup();

		const enter = press(button, 'Enter');
		const space = press(button, ' ');

		expect(onEnter).not.toHaveBeenCalled();
		expect(onSpace).not.toHaveBeenCalled();
		expect(enter.defaultPrevented).toBe(false);
		expect(space.defaultPrevented).toBe(false);
	});

	test('still runs Enter on the element itself and on non-interactive descendants', () => {
		const { host, plain, onEnter } = setup();

		expect(press(host, 'Enter').defaultPrevented).toBe(true);
		expect(press(plain, 'Enter').defaultPrevented).toBe(true);
		expect(onEnter).toHaveBeenCalledTimes(2);
	});

	test('still runs other keys from a focused button', () => {
		const { button, onM } = setup();

		press(button, 'm');

		expect(onM).toHaveBeenCalledOnce();
	});
});
