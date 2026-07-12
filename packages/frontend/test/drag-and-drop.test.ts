/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';

function dragEvent(data: Record<string, string>, types = Object.keys(data)): DragEvent {
	return {
		dataTransfer: {
			getData: (type: string) => data[type] ?? '',
			types,
		},
	} as unknown as DragEvent;
}

describe('drag data', () => {
	test('reads valid application drag data', () => {
		const event = dragEvent({ 'misskey/deckcolumn': JSON.stringify('column-id') });
		expect(getDragData(event, 'deckColumn')).toBe('column-id');
	});

	test.each(['{', 'null', JSON.stringify({ id: 'not-an-array' }), JSON.stringify([{ id: null }])])(
		'ignores malformed or invalid drive file data: %s',
		(data) => {
			const event = dragEvent({ 'misskey/drivefiles': data });
			expect(getDragData(event, 'driveFiles')).toBeNull();
		},
	);

	test('recognizes a supported type even when it is not first', () => {
		const event = dragEvent({}, ['text/plain', 'misskey/drivefiles']);
		expect(checkDragDataType(event, ['driveFiles'])).toBe(true);
	});

	test('does not accept an unrelated type', () => {
		const event = dragEvent({}, ['text/plain']);
		expect(checkDragDataType(event, ['driveFiles', 'driveFolders'])).toBe(false);
	});
});
