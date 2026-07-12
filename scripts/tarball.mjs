/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Pack } from 'tar/pack';
import meta from '../package.json' with { type: 'json' };

const cwd = fileURLToPath(new URL('..', import.meta.url));
const execFileAsync = promisify(execFile);

export async function listTrackedFiles(repositoryRoot = cwd) {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
		cwd: repositoryRoot,
		encoding: 'buffer',
		maxBuffer: 32 * 1024 * 1024,
	});

	return stdout.toString().split('\0').filter(Boolean);
}

export async function buildTarball() {
	const mkdirPromise = mkdir(resolve(cwd, 'built', 'tarball'), { recursive: true });
	const pack = new Pack({ cwd, gzip: true });
	const trackedFiles = await listTrackedFiles();

	for (const entry of trackedFiles) {
		pack.add(entry);
	}

	pack.end();

	await mkdirPromise;

	const out = createWriteStream(resolve(cwd, 'built', 'tarball', `misskey-${meta.version}.tar.gz`));
	pack.pipe(out);
	await finished(out);
}
