/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer, get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createHttpRequestService } from '@/core/net/HttpRequestService.js';
import { loadConfig } from '@/config.js';

/**
 * agent 経路 (URL プレビューが summaly へ渡す http/https Agent) の private-IP 遮断を、
 * 実サーバーへ繋いで確かめる。
 *
 * 遮断は Agent.createConnection の override で行うため、ランタイムがカスタム Agent を
 * 尊重しない場合は遮断を回避できる。Bun でも呼ばれることをここで固定する。
 */
describe('core:net:HttpRequestService の agent 経路', () => {
	let server: Server;
	let port = 0;
	let reached = 0;

	beforeAll(async () => {
		server = createServer((_req, res) => {
			reached++;
			res.end('REACHED');
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		port = (server.address() as AddressInfo).port;
	});

	afterAll(async () => {
		await new Promise<void>((r) => server.close(() => r()));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		reached = 0;
	});

	function serviceWith(allowedNetworks: string[]) {
		const config = loadConfig();
		return createHttpRequestService({
			...config,
			outboundNetwork: {
				...config.outboundNetwork,
				privateNetworkAccess: { ...config.outboundNetwork.privateNetworkAccess, allowedNetworks },
				proxy: { ...config.outboundNetwork.proxy, url: null },
			},
		} as unknown as typeof config);
	}

	const requestVia = (agent: ReturnType<typeof serviceWith>['httpAgent']) =>
		new Promise<string>((resolve) => {
			const req = get({ host: '127.0.0.1', port, path: '/', agent }, (res) => {
				let body = '';
				res.on('data', (chunk) => (body += chunk));
				res.on('end', () => resolve(`ok:${body}`));
			});
			req.on('error', (err) => resolve(`error:${err.message}`));
			req.setTimeout(5_000, () => resolve('timeout'));
		});

	test('private アドレスへの接続は socket ごと落とす', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		await expect(requestVia(serviceWith([]).httpAgent)).resolves.toMatch(/^error:Blocked address: 127\.0\.0\.1$/);
		expect(reached).toBe(0);
	});

	test('許可ネットワークに入っていれば通す', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		await expect(requestVia(serviceWith(['127.0.0.0/8']).httpAgent)).resolves.toBe('ok:REACHED');
		expect(reached).toBe(1);
	});
});
