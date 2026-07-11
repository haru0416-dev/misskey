/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { flattenDroppedFiles } from '@/features/drive/file-drop.js';
import type { DroppedDirectory, DroppedFile } from '@/features/drive/file-drop.js';

function droppedFile(path: string): DroppedFile {
	return { isFile: true, path, file: {} as File };
}

describe('flattenDroppedFiles', () => {
	test('preserves depth-first file order', () => {
		const files = flattenDroppedFiles([
			droppedFile('a'),
			{ isFile: false, path: 'dir', children: [droppedFile('b'), droppedFile('c')] },
			droppedFile('d'),
		]);

		expect(files.map(file => file.path)).toEqual(['a', 'b', 'c', 'd']);
	});

	test('handles deeply nested directories without recursive stack growth', () => {
		let item: DroppedDirectory | DroppedFile = droppedFile('leaf');
		for (let depth = 0; depth < 20_000; depth++) {
			item = { isFile: false, path: `dir-${depth}`, children: [item] };
		}

		expect(flattenDroppedFiles([item]).map(file => file.path)).toEqual(['leaf']);
	});
});
