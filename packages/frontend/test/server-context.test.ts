/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { parseJsonObject, readServerContext } from '@shared/utility/server-context.js';

afterEach(() => {
	document.getElementById('test-server-context')?.remove();
});

describe('server context', () => {
	test('reads a JSON object from the requested element', () => {
		const element = document.createElement('script');
		element.id = 'test-server-context';
		element.textContent = '{"note":{"id":"note-id"}}';
		document.body.append(element);

		expect(readServerContext('test-server-context')).toStrictEqual({ note: { id: 'note-id' } });
	});

	test.each([null, '', '{', '[]', 'null', '"text"'])(
		'returns null for a missing or invalid JSON object: %j',
		(value) => {
			expect(parseJsonObject(value)).toBeNull();
		},
	);
});
