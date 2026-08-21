/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const rootDir = _dirname + '/../';

const childProcesses = new Set();
let shuttingDown = false;
/** @type {Promise<void> | null} */
let shutdownPromise = null;

function spawnBun(args) {
	const isWindows = process.platform === 'win32';
	const shouldForceColor =
		(process.stdout.isTTY || process.stderr.isTTY) && process.env.FORCE_COLOR == null && process.env.NO_COLOR == null;
	const command = isWindows
		? [
				process.env.ComSpec ?? 'cmd.exe',
				'/d',
				'/s',
				'/c',
				`start "" /b /wait "${process.execPath}" ${args.map((arg) => `"${arg}"`).join(' ')}`,
			]
		: [process.execPath, ...args];
	const childProcess = Bun.spawn(command, {
		cwd: rootDir,
		env: shouldForceColor ? { ...process.env, FORCE_COLOR: '1' } : process.env,
		stdout: 'inherit',
		stderr: 'inherit',
		windowsVerbatimArguments: isWindows,
	});

	childProcesses.add(childProcess);
	return childProcess;
}

async function runBun(args) {
	const childProcess = spawnBun(args);
	try {
		const exitCode = await childProcess.exited;
		if (exitCode !== 0) throw new Error(`${args.join(' ')} exited with code ${exitCode}`);
	} finally {
		childProcesses.delete(childProcess);
	}
}

function startBun(args) {
	const childProcess = spawnBun(args);
	void childProcess.exited.then((exitCode) => {
		childProcesses.delete(childProcess);
		if (!shuttingDown) {
			if (exitCode !== 0) console.error(`${args.join(' ')} exited with code ${exitCode}`);
			void shutdown(1);
		}
	});
}

async function stopChildProcess(childProcess) {
	if (process.platform === 'win32' && childProcess.pid != null) {
		const taskkill = Bun.spawn(['taskkill', '/pid', childProcess.pid.toString(), '/t', '/f'], {
			stdout: 'ignore',
			stderr: 'ignore',
		});
		if ((await taskkill.exited) !== 0) childProcess.kill();
	} else {
		childProcess.kill();
	}

	await childProcess.exited;
}

function shutdown(exitCode) {
	if (shutdownPromise != null) return shutdownPromise;

	shuttingDown = true;
	shutdownPromise = (async () => {
		await Promise.allSettled([...childProcesses].map(stopChildProcess));
		process.exit(exitCode);
	})();
	return shutdownPromise;
}

process.on('SIGINT', () => {
	void shutdown(0);
});

process.on('SIGTERM', () => {
	void shutdown(0);
});

try {
	await runBun(['run', 'clean']);

	// アセットのビルドで依存しているので一番最初に必要
	await runBun(['run', '--bun', '--filter', 'i18n', 'build']);

	// build:backend-deps (= i18n + misskey-js build) は、i18n が直前で・misskey-js がこの
	// Promise.all 内でそれぞれビルドされるため呼ばない (同一 built/ への並行二重ビルドになる)
	await Promise.all([
		runBun(['run', 'build-pre']),
		runBun(['run', 'build-assets']),
		runBun(['run', '--bun', '--filter', 'mfm-js', 'build']),
		// icons-subsetterは開発段階では使用されないが、型エラーを抑制するためにはじめの一度だけビルドする
		runBun(['run', '--bun', '--filter', 'icons-subsetter', 'build']),
		runBun(['run', '--bun', '--filter', 'misskey-js', 'build']),
	]);

	startBun(['run', 'build-pre', '--watch']);
	startBun(['run', '--bun', '--filter', 'backend', 'dev']);
	startBun(['run', '--bun', '--filter', 'frontend', 'watch']);
	startBun(['run', '--bun', '--filter', 'frontend-embed', 'watch']);
	startBun(['run', '--bun', '--filter', 'sw', 'watch']);
	startBun(['run', '--bun', '--filter', 'misskey-js', 'watch', '--no-clean']);
	startBun(['run', '--bun', '--filter', 'mfm-js', 'watch']);
	startBun(['run', '--bun', '--filter', 'i18n', 'watch', '--no-clean']);
} catch (error) {
	if (!shuttingDown) {
		console.error(error);
		await shutdown(1);
	}
}
