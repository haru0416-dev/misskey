/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directories = [];
afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
	const directory = mkdtempSync(join(tmpdir(), 'toneriko-test-config-'));
	directories.push(directory);
	mkdirSync(join(directory, '.github/misskey'), { recursive: true });
	writeFileSync(join(directory, '.github/misskey/test.yml'), 'database: dedicated-test-db\n');
	return directory;
}

function initialize(directory, source) {
	return Bun.spawn([process.execPath, join(import.meta.dirname, 'ensure-test-config.mjs'), ...source], {
		cwd: directory,
		stdout: 'pipe',
		stderr: 'pipe',
	});
}

test('creates a missing configuration and preserves it across concurrent initializers', async () => {
	const directory = fixture();
	const processes = [initialize(directory, []), initialize(directory, [])];
	expect(await Promise.all(processes.map((process) => process.exited))).toEqual([0, 0]);
	expect(readFileSync(join(directory, '.config/test.yml'), 'utf8')).toBe('database: dedicated-test-db\n');
	writeFileSync(join(directory, '.config/test.yml'), 'database: custom-test-db\n');
	expect(await initialize(directory, []).exited).toBe(0);
	expect(readFileSync(join(directory, '.config/test.yml'), 'utf8')).toBe('database: custom-test-db\n');
});

test('uses the requested template for a missing configuration', async () => {
	const directory = fixture();
	writeFileSync(join(directory, 'devcontainer.yml'), 'database: devcontainer-test-db\n');
	expect(await initialize(directory, ['devcontainer.yml']).exited).toBe(0);
	expect(readFileSync(join(directory, '.config/test.yml'), 'utf8')).toBe('database: devcontainer-test-db\n');
});

test('reports an unreadable template as failure', async () => {
	const directory = fixture();
	const process = initialize(directory, ['missing.yml']);
	expect(await process.exited).not.toBe(0);
	expect(await new Response(process.stderr).text()).toContain('ENOENT');
});
