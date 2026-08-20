/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { loadConfig } from '@/config.js';

type TestTargetMode = 'local' | 'external';
type TestWorkerMode = 'local' | 'external';

type LocalSetupModule = {
	setup: () => Promise<void>;
	teardown: () => Promise<void>;
};

export type TestJobQueueRuntime = {
	close: () => Promise<void>;
};

const config = loadConfig();
const configuredPort = 'tcp' in config.server.listen ? config.server.listen.tcp.port : 3000;
const mode = process.env['MISSKEY_E2E_TARGET_MODE'] ?? 'local';
const workerMode = process.env['MISSKEY_E2E_WORKER_MODE'] ?? 'local';

if (mode !== 'local' && mode !== 'external') {
	throw new Error('MISSKEY_E2E_TARGET_MODE must be either "local" or "external"');
}

if (workerMode !== 'local' && workerMode !== 'external') {
	throw new Error('MISSKEY_E2E_WORKER_MODE must be either "local" or "external"');
}

function readUrl(name: string, fallback: string): URL {
	const value = process.env[name] ?? fallback;
	try {
		const url = new URL(value);
		if (!url.pathname.endsWith('/')) url.pathname += '/';
		return url;
	} catch (error) {
		throw new Error(`${name} must be a valid absolute URL`, { cause: error });
	}
}

if (mode === 'external') {
	for (const name of ['MISSKEY_E2E_TARGET_URL', 'MISSKEY_E2E_CONTROL_URL']) {
		if (process.env[name] == null) throw new Error(`${name} is required for an external e2e target`);
	}
}

const transportUrl = readUrl('MISSKEY_E2E_TARGET_URL', `http://127.0.0.1:${configuredPort}/`);
const instanceUrl = readUrl('MISSKEY_E2E_INSTANCE_URL', config.instance.url);
const controlUrl = readUrl('MISSKEY_E2E_CONTROL_URL', `http://localhost:${configuredPort + 1000}/`);
const oauthClientPort = Number(process.env['MISSKEY_E2E_OAUTH_CLIENT_PORT'] ?? configuredPort + 1);

for (const [name, url] of [
	['MISSKEY_E2E_TARGET_URL', transportUrl],
	['MISSKEY_E2E_CONTROL_URL', controlUrl],
] as const) {
	if (url.pathname !== '/') throw new Error(`${name} must be an origin URL without a path prefix`);
}

if (!Number.isSafeInteger(oauthClientPort) || oauthClientPort < 1 || oauthClientPort > 65535) {
	throw new Error('MISSKEY_E2E_OAUTH_CLIENT_PORT must be an integer between 1 and 65535');
}

export const testTarget = Object.freeze({
	mode: mode as TestTargetMode,
	workerMode: workerMode as TestWorkerMode,
	transportUrl,
	instanceUrl,
	controlUrl,
	oauthClientPort,
});

export function resolveTargetUrl(path: string | URL): URL {
	return new URL(path, testTarget.transportUrl);
}

export function resolveStreamingUrl(): URL {
	const url = resolveTargetUrl('streaming');
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	return url;
}

let localSetupModule: LocalSetupModule | undefined;

export async function setup(): Promise<void> {
	if (testTarget.mode === 'external') return;

	localSetupModule = (await import(new URL('../built-test/entry.js', import.meta.url).href)) as LocalSetupModule;
	await localSetupModule.setup();
}

export async function teardown(): Promise<void> {
	await localSetupModule?.teardown();
	localSetupModule = undefined;
}

export async function startJobQueue(): Promise<TestJobQueueRuntime> {
	if (testTarget.workerMode === 'external') {
		// 外部ターゲットがバックグラウンドワーカーを所有するため、テストプロセスでは TS キューを起動しない。
		return { close: async () => {} };
	}

	const { jobQueue } = await import('@/boot/common.js');
	return jobQueue();
}
