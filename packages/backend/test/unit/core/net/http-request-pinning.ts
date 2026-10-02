/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as dns from 'node:dns';
import { createServer, request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createHttpRequestService } from '@/core/net/http-request-service.js';
import { loadConfig } from '@/config.js';

// 検査後の再解決は DNS rebinding を許すため、接続先の IP と論理ホスト名は分けて扱う。
// 検査後に DNS 応答を別の IP へ変え、承認した接続先と元の Host・URL が維持されることを実通信で確かめる。
describe('core:net:HttpRequestService の接続先固定', () => {
	let allowed: Server;
	let blocked: Server;
	let allowedPort = 0;
	let blockedPort = 0;
	const hits: string[] = [];

	beforeAll(async () => {
		allowed = createServer((req, res) => {
			hits.push(`allowed:${req.headers.host ?? ''}`);
			if (req.url === '/redirect') {
				res.writeHead(302, { location: '/actor?redirected=1' });
				res.end();
				return;
			}
			if (req.url === '/cross-origin') {
				res.writeHead(302, { location: `http://remote.test:${allowedPort}/actor` });
				res.end();
				return;
			}
			if (req.url?.startsWith('/actor')) {
				res.setHeader('content-type', 'application/activity+json');
				res.end(JSON.stringify({ id: `http://${req.headers.host}${req.url}`, type: 'Person' }));
				return;
			}
			if (req.url === '/wrong-host') {
				res.setHeader('content-type', 'application/activity+json');
				res.end(JSON.stringify({ id: `http://other.test:${allowedPort}/wrong-host`, type: 'Person' }));
				return;
			}
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
			return [{ address: call === 1 ? '127.0.0.1' : '127.0.0.2', family: 4 }];
		}) as unknown as typeof dns.promises.lookup);

		const service = serviceWith(['127.0.0.0/8']);
		const res = await service.send(
			`http://pinned.test:${allowedPort}/`,
			{},
			{ throwErrorWhenResponseNotOk: true, validators: [] },
		);

		expect(res.status).toBe(200);
		expect(res.url).toBe(`http://pinned.test:${allowedPort}/`);
		await expect(res.text()).resolves.toBe('allowed');
		// Host には元のホスト名 (とポート) が入る。IP は入らない。
		expect(hits).toStrictEqual([`allowed:pinned.test:${allowedPort}`]);
	});

	test('接続先を固定しても ActivityPub の ID を元の URL と照合できる', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
			{ address: '127.0.0.1', family: 4 },
		]) as unknown as typeof dns.promises.lookup);

		const url = `http://pinned.test:${allowedPort}/actor`;
		await expect(serviceWith(['127.0.0.0/8']).getActivityJson(url)).resolves.toEqual({ id: url, type: 'Person' });
		expect(hits).toStrictEqual([`allowed:pinned.test:${allowedPort}`]);
	});

	test.each([
		['/redirect', 'pinned.test', '/actor?redirected=1'],
		['/cross-origin', 'remote.test', '/actor'],
	])('リダイレクト %s の最終 URL に論理ホスト名を保持する', async (path, host, finalPath) => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
			{ address: '127.0.0.1', family: 4 },
		]) as unknown as typeof dns.promises.lookup);

		const res = await serviceWith(['127.0.0.0/8']).send(`http://pinned.test:${allowedPort}${path}`);
		const finalUrl = `http://${host}:${allowedPort}${finalPath}`;
		expect(res.url).toBe(finalUrl);
		await expect(res.json()).resolves.toEqual({ id: finalUrl, type: 'Person' });
		expect(hits).toStrictEqual([`allowed:pinned.test:${allowedPort}`, `allowed:${host}:${allowedPort}`]);
	});

	test('接続先を固定しても別ホストの ActivityPub ID は拒否する', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
			{ address: '127.0.0.1', family: 4 },
		]) as unknown as typeof dns.promises.lookup);

		await expect(
			serviceWith(['127.0.0.0/8']).getActivityJson(`http://pinned.test:${allowedPort}/wrong-host`),
		).rejects.toThrow(/does not match response url/);
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

// proxy 経由でも、proxy へ渡す宛先を検査した IP にする。ホスト名のまま渡すと proxy が改めて名前を引き、
// 検査後に応答が変われば検査していないアドレスへ繋がりうる。proxy が受け取った宛先を記録して確かめる。
describe('core:net:HttpRequestService の proxy 経由の接続先固定', () => {
	let target: Server;
	let proxy: Server;
	let targetPort = 0;
	let proxyPort = 0;
	const proxyTargets: string[] = [];
	const hosts: string[] = [];

	beforeAll(async () => {
		target = createServer((req, res) => {
			hosts.push(req.headers.host ?? '');
			res.end('via proxy');
		});
		// 絶対 URI の GET を中継するだけの最小の proxy。宛先は要求された URI のまま (名前解決も proxy 任せ)。
		proxy = createServer((req, res) => {
			proxyTargets.push(req.url ?? '');
			const upstream = new URL(req.url ?? '');
			const forwarded = httpRequest(
				{
					host: upstream.hostname,
					port: upstream.port,
					path: upstream.pathname + upstream.search,
					method: req.method,
					headers: req.headers,
				},
				(upstreamRes) => {
					res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
					upstreamRes.pipe(res);
				},
			);
			forwarded.on('error', () => res.writeHead(502).end());
			req.pipe(forwarded);
		});
		// agent 経由 (hpagent) は http の宛先にも CONNECT でトンネルを張る。
		proxy.on('connect', (req, clientSocket, head) => {
			proxyTargets.push(`CONNECT ${req.url ?? ''}`);
			const [host, port] = (req.url ?? '').split(':');
			const upstream = connect(Number(port), host!, () => {
				clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				upstream.write(head);
				upstream.pipe(clientSocket);
				clientSocket.pipe(upstream);
			});
			upstream.on('error', () => clientSocket.destroy());
			clientSocket.on('error', () => upstream.destroy());
		});
		await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
		await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
		targetPort = (target.address() as AddressInfo).port;
		proxyPort = (proxy.address() as AddressInfo).port;
	});

	afterAll(async () => {
		await new Promise<void>((r) => target.close(() => r()));
		await new Promise<void>((r) => proxy.close(() => r()));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		proxyTargets.length = 0;
		hosts.length = 0;
	});

	test.each([false, true])(
		'proxy には検査した IP を宛先として渡し、Host は元のホスト名にする (agent: %s)',
		async (useAgent) => {
			vi.stubEnv('NODE_ENV', 'production');
			vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
				{ address: '127.0.0.1', family: 4 },
			]) as unknown as typeof dns.promises.lookup);
			const config = loadConfig();
			const service = createHttpRequestService(
				{
					...config,
					outboundNetwork: {
						...config.outboundNetwork,
						privateNetworkAccess: { ...config.outboundNetwork.privateNetworkAccess, allowedNetworks: ['127.0.0.0/8'] },
						proxy: { ...config.outboundNetwork.proxy, url: `http://127.0.0.1:${proxyPort}`, bypassHosts: [] },
					},
				} as unknown as typeof config,
				useAgent,
			);

			const res = await service.send(`http://pinned.test:${targetPort}/via`);
			await expect(res.text()).resolves.toBe('via proxy');
			// fetch は絶対 URI、agent は CONNECT で宛先を渡す。どちらもホスト名ではなく検査した IP になる。
			expect(proxyTargets).toStrictEqual([
				useAgent ? `CONNECT 127.0.0.1:${targetPort}` : `http://127.0.0.1:${targetPort}/via`,
			]);
			expect(hosts).toStrictEqual([`pinned.test:${targetPort}`]);
			service.dispose?.();
		},
	);
});
