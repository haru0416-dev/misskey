/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { listTrackedFiles } from './tarball.mjs';

test('listTrackedFiles excludes untracked secrets', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'misskey-tarball-'));

	try {
		execFileSync('git', ['init', '--quiet'], { cwd: directory });
		await writeFile(join(directory, 'tracked.txt'), 'public');
		await writeFile(join(directory, '.env'), 'SECRET=do-not-package');
		execFileSync('git', ['add', 'tracked.txt'], { cwd: directory });

		assert.deepEqual(await listTrackedFiles(directory), ['tracked.txt']);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
