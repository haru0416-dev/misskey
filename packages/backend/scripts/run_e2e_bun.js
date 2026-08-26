/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 通常のe2eとは別にテスト対象サーバーを独立プロセスで起動し、
// externalモードで実際のHTTP境界を通る経路を検証する。

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, '..');
const targetEntry = resolve(scriptDir, 'e2e_external_target.mjs');
const compiledConfigPath = resolve(backendDir, '../../built/.config.json');

const TARGET_READY_TIMEOUT_MS = 120_000;

function readConfiguredPort() {
	const envelope = JSON.parse(readFileSync(compiledConfigPath, 'utf-8'));
	const listen = envelope.config?.server?.listen;
	const port = listen?.tcp?.port;
	if (typeof port !== 'number') {
		throw new Error('The compiled config does not listen on TCP; the bun e2e target needs a TCP port.');
	}
	return port;
}

async function waitForController(controlUrl, target) {
	const deadline = Date.now() + TARGET_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (target.exitCode != null) throw new Error(`The bun e2e target exited early (code ${target.exitCode}).`);
		try {
			// コントローラは POST しか受けないので、404 でも「応答した = 起動済み」と判定できる
			await fetch(controlUrl, { signal: AbortSignal.timeout(2000) });
			return;
		} catch {
			await new Promise((res) => setTimeout(res, 500));
		}
	}
	throw new Error(`The bun e2e target did not become ready within ${TARGET_READY_TIMEOUT_MS}ms.`);
}

const port = readConfiguredPort();
const controlUrl = `http://localhost:${port + 1000}/`;

// bun 自身で起動する (`node` を経由すると `bun run --bun` が仕込む node→bun shim を踏む)
const target = Bun.spawn([process.execPath, targetEntry], {
	cwd: backendDir,
	env: { ...process.env, NODE_ENV: 'test' },
	stdin: 'ignore',
	stdout: 'inherit',
	stderr: 'inherit',
});

let exitCode = 1;
try {
	await waitForController(controlUrl, target);

	const test = Bun.spawn([process.execPath, resolve(scriptDir, 'run_e2e.js'), ...process.argv.slice(2)], {
		cwd: backendDir,
		env: {
			...process.env,
			MISSKEY_E2E_TARGET_MODE: 'external',
			MISSKEY_E2E_TARGET_URL: `http://127.0.0.1:${port}/`,
			MISSKEY_E2E_CONTROL_URL: controlUrl,
		},
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit',
	});
	exitCode = await test.exited;
} finally {
	if (target.exitCode == null) target.kill('SIGTERM');
	await target.exited;
}

process.exit(exitCode);
