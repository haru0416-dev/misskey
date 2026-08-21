/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { spawnChecked } from './spawn-checked.mjs';

const temporaryDirectories = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('migrate-config-v2', () => {
	test('writes a schema-valid config with current process and pool fields', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'misskey-config-migration-'));
		temporaryDirectories.push(directory);
		const inputPath = join(directory, 'old.yml');
		const outputPath = join(directory, 'new.yml');
		await writeFile(
			inputPath,
			[
				'url: https://example.test',
				'clusterLimit: 3',
				'db:',
				'  host: localhost',
				'  db: misskey',
				'  user: misskey',
				'  pass: password',
				'  extra:',
				'    max: 20',
				'redis:',
				'  host: localhost',
				'',
			].join('\n'),
		);

		await spawnChecked([process.execPath, 'scripts/migrate-config-v2.mjs', inputPath, outputPath]);

		const migrated = parse(await readFile(outputPath, 'utf8'));
		expect(migrated.server.process).toEqual({
			httpWorkers: 1,
			queueWorkers: 3,
			computationThreadsPerWorker: 1,
			pidFile: '/tmp/misskey.pid',
		});
		expect(migrated.database.pool.maximumConnectionsPerHost).toBe(40);
		expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
	});
});
