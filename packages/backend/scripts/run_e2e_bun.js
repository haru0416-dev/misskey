/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 本番の backend は bun で動き、DBドライバも Bun.sql (src/db/bun-sql.ts) が既定になる。
// 一方 e2e の通常経路 (scripts/run_e2e.js) は vitest を Node.js で起動し、テスト対象サーバーも
// 同じ Node.js プロセス内に立てるため、**本番のDBドライバは一切通らない**。
// このスクリプトはテスト対象サーバーだけを bun の別プロセスとして起動し、vitest からは
// external モードで叩かせることで、bun ランタイム上の経路を e2e で検証する。

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

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
const target = execa(process.execPath, [targetEntry], {
	cwd: backendDir,
	env: { NODE_ENV: 'test' },
	stdout: process.stdout,
	stderr: process.stderr,
	reject: false,
});

let exitCode = 1;
try {
	await waitForController(controlUrl, target);

	const result = await execa(process.execPath, [resolve(scriptDir, 'run_e2e.js'), ...process.argv.slice(2)], {
		cwd: backendDir,
		env: {
			MISSKEY_E2E_TARGET_MODE: 'external',
			MISSKEY_E2E_TARGET_URL: `http://127.0.0.1:${port}/`,
			MISSKEY_E2E_CONTROL_URL: controlUrl,
		},
		stdout: process.stdout,
		stderr: process.stderr,
		reject: false,
	});
	exitCode = result.exitCode ?? 1;
} finally {
	target.kill('SIGTERM');
	await target.catch(() => {});
}

process.exit(exitCode);
