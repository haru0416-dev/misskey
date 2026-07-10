/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const rootDir = _dirname + '/../';

const bun = (args) =>
	execa('bun', args, {
		cwd: rootDir,
		stdout: process.stdout,
		stderr: process.stderr,
	});

await bun(['run', 'clean']);

// アセットのビルドで依存しているので一番最初に必要
await bun(['run', '--bun', '--filter', 'i18n', 'build']);

// build:backend-deps (= i18n + misskey-js build) は、i18n が直前で・misskey-js がこの
// Promise.all 内でそれぞれビルドされるため呼ばない (同一 built/ への並行二重ビルドになる)
await Promise.all([
	bun(['run', 'build-pre']),
	bun(['run', 'build-assets']),
	bun(['run', '--bun', '--filter', 'mfm-js', 'build']),
	// icons-subsetterは開発段階では使用されないが、型エラーを抑制するためにはじめの一度だけビルドする
	bun(['run', '--bun', '--filter', 'icons-subsetter', 'build']),
	bun(['run', '--bun', '--filter', 'misskey-js', 'build']),
]);

execa('bun', ['run', 'build-pre', '--watch'], {
	cwd: rootDir,
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('bun', ['run', '--bun', '--filter', 'backend', 'dev'], {
	cwd: rootDir,
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('bun', ['run', '--bun', '--filter', 'frontend', 'watch'], {
	cwd: rootDir,
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('bun', ['run', '--bun', '--filter', 'frontend-embed', 'watch'], {
	cwd: rootDir,
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('bun', ['run', '--bun', '--filter', 'sw', 'watch'], {
	cwd: rootDir,
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('bun', ['run', '--bun', '--filter', 'misskey-js', 'watch', '--no-clean'], {
	cwd: rootDir,
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('bun', ['run', '--bun', '--filter', 'mfm-js', 'watch'], {
	cwd: rootDir,
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('bun', ['run', '--bun', '--filter', 'i18n', 'watch', '--no-clean'], {
	cwd: rootDir,
	stdout: process.stdout,
	stderr: process.stderr,
});
