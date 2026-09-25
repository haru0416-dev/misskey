/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach } from 'vitest';
import { onScrollBottom, onScrollTop } from '@shared/utility/scroll.js';

describe('Scroll', () => {
	afterEach(() => {
		window.document.body.replaceChildren();
	});

	describe('onScrollTop', () => {
		test('Initial onScrollTop callback for connected elements', () => {
			const div = window.document.createElement('div');
			assert.strictEqual(div.scrollTop, 0);

			window.document.body.append(div);

			let called = false;
			onScrollTop(div as any as HTMLElement, () => (called = true));

			assert.ok(called);
		});

		test('No onScrollTop callback for disconnected elements', () => {
			const div = window.document.createElement('div');
			assert.strictEqual(div.scrollTop, 0);

			let called = false;
			onScrollTop(div as any as HTMLElement, () => (called = true));

			assert.ok(!called);
		});
	});

	describe('onScrollBottom', () => {
		test('Initial onScrollBottom callback for connected elements', () => {
			const div = window.document.createElement('div');
			assert.strictEqual(div.scrollTop, 0);

			window.document.body.append(div);

			let called = false;
			onScrollBottom(div as any as HTMLElement, () => (called = true));

			assert.ok(called);
		});

		test('No onScrollBottom callback for disconnected elements', () => {
			const div = window.document.createElement('div');
			assert.strictEqual(div.scrollTop, 0);

			let called = false;
			onScrollBottom(div as any as HTMLElement, () => (called = true));

			assert.ok(!called);
		});
	});
});
