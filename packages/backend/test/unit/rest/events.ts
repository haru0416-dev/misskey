/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { createHonoEventPublishers } from '@/server/rest/events.js';

describe('createHonoEventPublishers', () => {
	test('publishNotesStream は note をラップせずそのまま message にする (GlobalEventService#publish の type=null 挙動と一致)', () => {
		const published: { host: string; message: string }[] = [];
		const publishers = createHonoEventPublishers({
			config: { runtime: { host: 'example.tld' } },
			publish: (host, message) => published.push({ host, message }),
		});

		const note = { id: 'note1', text: 'hello' } as unknown as Parameters<typeof publishers.publishNotesStream>[0];
		publishers.publishNotesStream(note);

		expect(published).toHaveLength(1);
		expect(published[0]!.host).toBe('example.tld');
		expect(JSON.parse(published[0]!.message)).toEqual({
			channel: 'notesStream',
			message: note,
		});
	});

	test('publishMainStream 等の type 付きイベントは {type, body} でラップする', () => {
		const published: { host: string; message: string }[] = [];
		const publishers = createHonoEventPublishers({
			config: { runtime: { host: 'example.tld' } },
			publish: (host, message) => published.push({ host, message }),
		});

		publishers.publishMainStream('user1', 'notification', { id: 'n1' });

		expect(JSON.parse(published[0]!.message)).toEqual({
			channel: 'mainStream:user1',
			message: { type: 'notification', body: { id: 'n1' } },
		});
	});

	test('value が undefined の type 付きイベントは body: null になる', () => {
		const published: { host: string; message: string }[] = [];
		const publishers = createHonoEventPublishers({
			config: { runtime: { host: 'example.tld' } },
			publish: (host, message) => published.push({ host, message }),
		});

		publishers.publishInternalEvent('metaUpdated' as never);

		expect(JSON.parse(published[0]!.message)).toEqual({
			channel: 'internal',
			message: { type: 'metaUpdated', body: null },
		});
	});
});
