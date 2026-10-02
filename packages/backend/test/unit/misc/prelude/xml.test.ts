/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from 'vitest';
import { escapeAttribute } from '@/misc/prelude/xml.js';

test('XRD 属性中の繰り返す予約文字をすべてエスケープする', () => {
	expect(escapeAttribute('a&b&c<d<e"f"g\'h\'i')).toBe('a&amp;b&amp;c&lt;d&lt;e&quot;f&quot;g&apos;h&apos;i');
});
