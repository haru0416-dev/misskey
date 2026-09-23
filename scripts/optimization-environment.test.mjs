/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('an invalid disposable marker prevents deployment lifecycle commands', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'misskey-optimization-marker-'));
	const root = fileURLToPath(new URL('../', import.meta.url));
	const cli = join(root, 'packages/backend/scripts/optimization/compare.mts');
	const configPath = join(directory, 'config.json');
	const experiment = join(directory, 'experiment');
	const marker = join(directory, 'marker');
	const witness = join(directory, 'lifecycle-command-ran');
	const command = { argv: [process.execPath, '-e', `await Bun.write(${JSON.stringify(witness)}, 'ran');`], cwd: root };
	const deployment = {
		reset: command,
		start: command,
		stop: command,
		identity: command,
		recoverySnapshot: command,
		peers: [
			{ url: 'http://127.0.0.1:9', adminTokenEnv: 'UNUSED_FORK_TOKEN', kind: 'fork' },
			{ url: 'http://127.0.0.1:10', adminTokenEnv: 'UNUSED_UPSTREAM_TOKEN', kind: 'upstream' },
		],
		observer: {
			databaseUrlEnv: 'UNUSED_DB_URL',
			redisUrlEnv: 'UNUSED_REDIS_URL',
			applicationRole: 'unused',
			queueKeys: ['fixture:deliver', 'fixture:inbox', 'fixture:db'],
		},
		expectedRevision: '0'.repeat(40),
	};

	try {
		await writeFile(
			configPath,
			JSON.stringify({
				schemaVersion: 1,
				isolation: { disposable: true, markerFile: marker, snapshotSha256: 'f'.repeat(64) },
				before: deployment,
				after: deployment,
			}),
		);
		await writeFile(marker, 'not-authorized');
		const prepare = spawnSync(process.execPath, [cli, 'prepare', configPath, experiment], {
			cwd: root,
			encoding: 'utf8',
			timeout: 15_000,
		});
		assert.equal(prepare.status, 0, prepare.stderr);
		const run = spawnSync(process.execPath, [cli, 'run', configPath, experiment], {
			cwd: root,
			encoding: 'utf8',
			timeout: 15_000,
		});
		assert.equal(run.error, undefined);
		assert.equal(run.status, 1, run.stderr);
		await assert.rejects(access(witness), { code: 'ENOENT' });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
