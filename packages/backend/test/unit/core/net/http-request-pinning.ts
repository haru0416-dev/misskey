/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as dns from 'node:dns';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createHttpRequestService } from '@/core/net/HttpRequestService.js';
import { loadConfig } from '@/config.js';

/**
 * SSRF 検査で見た IP へそのまま接続していることを、実サーバーで確かめる。
 *
 * 検査と接続で別々に名前解決していると、その間に応答を差し替える (DNS rebinding) 余地が残る。
 * ここでは名前解決を差し替えて「検査時と接続時で違う IP を返す」状況を作り、
 * 接続先が検査時の IP に固定されることを見る。
 */
describe('core:net:HttpRequestService の接続先固定', () => {
	let allowed: Server;
	let blocked: Server;
	let allowedPort = 0;
	let blockedPort = 0;
	const hits: string[] = [];

	beforeAll(async () => {
		allowed = createServer((req, res) => {
			hits.push(`allowed:${req.headers.host ?? ''}`);
			res.end('allowed');
		});
		blocked = createServer((req, res) => {
			hits.push(`blocked:${req.headers.host ?? ''}`);
			res.end('blocked');
		});
		await new Promise<void>((r) => allowed.listen(0, '127.0.0.1', r));
		await new Promise<void>((r) => blocked.listen(0, '127.0.0.1', r));
		allowedPort = (allowed.address() as AddressInfo).port;
		blockedPort = (blocked.address() as AddressInfo).port;
	});

	afterAll(async () => {
		await new Promise<void>((r) => allowed.close(() => r()));
		await new Promise<void>((r) => blocked.close(() => r()));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		hits.length = 0;
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

	test('検査した IP へ接続し、Host ヘッダは元のホスト名のまま送る', async () => {
		// 127.0.0.0/8 を許可しないと検査で弾かれるので、許可したうえで固定だけを見る。
		vi.stubEnv('NODE_ENV', 'production');

		let call = 0;
		vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => {
			call++;
			// 1 回目 (検査) は allowed、2 回目以降 (接続時に再解決されたら) は blocked を返す。
			return [{ address: '127.0.0.1', family: 4 }];
		}) as unknown as typeof dns.promises.lookup);

		const service = serviceWith(['127.0.0.0/8']);
		const res = await service.send(
			`http://pinned.test:${allowedPort}/`,
			{},
			{ throwErrorWhenResponseNotOk: true, validators: [] },
		);

		expect(res.status).toBe(200);
		await expect(res.text()).resolves.toBe('allowed');
		// Host には元のホスト名 (とポート) が入る。IP は入らない。
		expect(hits).toStrictEqual([`allowed:pinned.test:${allowedPort}`]);
		expect(call).toBeGreaterThan(0);
	});

	test('検査で弾かれる宛先には接続しない', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
			{ address: '127.0.0.1', family: 4 },
		]) as unknown as typeof dns.promises.lookup);

		// 許可ネットワークを空にすると 127.0.0.1 は private として弾かれる。
		const service = serviceWith([]);
		await expect(
			service.send(`http://blocked.test:${blockedPort}/`, {}, { throwErrorWhenResponseNotOk: true, validators: [] }),
		).rejects.toThrow(/Blocked/);

		// サーバーには 1 度も届かない。
		expect(hits).toStrictEqual([]);
	});
});
