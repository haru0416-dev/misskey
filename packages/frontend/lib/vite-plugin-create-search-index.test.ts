/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

describe('search index plugin initialization', () => {
	test('can be imported and used before loading the Vite configuration', () => {
		// Vitest 自身が Vite 設定を先に読むため、別プロセスで import 順序を検証する。
		const output = execFileSync(
			'bun',
			[
				'-e',
				`import { MarkerIdAssigner } from './lib/vite-plugin-create-search-index.ts';
const result = new MarkerIdAssigner().processFile(
  '/project/packages/frontend/src/pages/settings/test.vue',
  '<template><SearchMarker><SearchLabel>Test</SearchLabel></SearchMarker></template>',
);
console.log(result.code);`,
			],
			{ encoding: 'utf8', timeout: 10_000 },
		);
		expect(output).toContain('data-in-app-search-marker-id=');
		expect(output).toContain('<SearchLabel>Test</SearchLabel>');
	});
});
