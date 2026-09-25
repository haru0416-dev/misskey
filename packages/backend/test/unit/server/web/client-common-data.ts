/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type { Manifest } from 'vite';
import { collectViteAssetFiles } from '@/server/web/client-common-data.js';

describe('collectViteAssetFiles', () => {
	test('入口が静的に import するチャンクを奥まで先読みに入れ、動的 import は入れない', () => {
		const manifest: Manifest = {
			'src/_boot_.ts': {
				file: 'boot.js',
				src: 'src/_boot_.ts',
				isEntry: true,
				imports: ['_a.js', '_b.js'],
				css: ['boot.css'],
				dynamicImports: ['src/lazy.ts'],
			},
			'_a.js': { file: 'a.js', imports: ['_c.js'] },
			'_b.js': { file: 'b.js', imports: ['_missing.js', '_c.js', '_d.js'], css: ['b.css'] },
			'_c.js': { file: 'c.js', imports: ['_a.js'] },
			'_d.js': { file: 'd.js' },
			'src/lazy.ts': { file: 'lazy.js', src: 'src/lazy.ts', isDynamicEntry: true },
		};

		const files = collectViteAssetFiles(manifest);

		expect(files.entryJs).toBe('boot.js');
		expect([...files.modulePreloads].sort()).toEqual(['a.js', 'b.js', 'c.js', 'd.js']);
		expect([...files.css].sort()).toEqual(['b.css', 'boot.css']);
	});
});
