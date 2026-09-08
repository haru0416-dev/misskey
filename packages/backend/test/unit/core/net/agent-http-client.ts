/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import { createHttpRequestService } from '@/core/net/HttpRequestService.js';

describe('Bun HTTP Agent network settings', () => {
	const clients: ReturnType<typeof createHttpRequestService>[] = [];
	const servers: ReturnType<typeof createServer>[] = [];
	const sockets = new Set<Socket>();
	function client(
		overrides: Partial<Config['outboundNetwork']> = {},
		http: Partial<Config['outboundNetwork']['http']> = {},
	) {
		const config = loadConfig();
		const instance = createHttpRequestService(
			{
				...config,
				outboundNetwork: {
					...config.outboundNetwork,
					proxy: { bypassHosts: [] },
					...overrides,
					http: { ...config.outboundNetwork.http, ...http },
				},
			},
			true,
		);
		clients.push(instance);
		return instance;
	}
	async function listen(server: ReturnType<typeof createServer>, host = '127.0.0.1') {
		servers.push(server);
		server.on('connection', (socket) => {
			sockets.add(socket);
			socket.on('close', () => sockets.delete(socket));
		});
		await new Promise<void>((resolve) => server.listen(0, host, resolve));
		return (server.address() as AddressInfo).port;
	}
	afterEach(async () => {
		for (const instance of clients.splice(0)) instance.dispose();
		for (const socket of sockets) socket.destroy();
		await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
	});

	test.each([
		['ipv4', '127.0.0.1', '127.0.0.2'],
		['ipv6', '::1', '::1'],
	] as const)('uses the configured source and %s family', async (addressFamily, host, bindAddress) => {
		const port = await listen(
			createServer((req, res) => res.end(req.socket.remoteAddress)),
			host,
		);
		const response = await client({ addressFamily, bindAddress }).send(`http://localhost:${port}`);
		expect(await response.text()).toBe(bindAddress);
	});

	test('limits concurrent sockets and reuses the connection', async () => {
		let active = 0;
		let peak = 0;
		const ports = new Set<number>();
		const port = await listen(
			createServer((req, res) => {
				ports.add(req.socket.remotePort!);
				peak = Math.max(peak, ++active);
				setTimeout(() => {
					active--;
					res.end('ok');
				}, 20);
			}),
		);
		const http = client({}, { maximumSockets: 1, maximumFreeSockets: 1 });
		await Promise.all(Array.from({ length: 3 }, () => http.send(`http://127.0.0.1:${port}`)));
		expect(peak).toBe(1);
		expect(ports.size).toBe(1);
	});

	test('does not retain free sockets when the limit is zero', async () => {
		const port = await listen(createServer((_req, res) => res.end('ok')));
		await client({}, { maximumFreeSockets: 0 }).send(`http://127.0.0.1:${port}`);
		await expect.poll(() => sockets.size).toBe(0);
	});

	test('applies the socket timeout before the request deadline', async () => {
		const port = await listen(createServer(() => {}));
		await expect(
			client({}, { connectionTimeoutMs: 30 }).send(`http://127.0.0.1:${port}`, { timeout: 2000 }),
		).rejects.toThrow('HTTP connection timed out');
	});

	test('applies source IP to proxy connections and honors bypass hosts', async () => {
		const destinationPort = await listen(createServer((req, res) => res.end(req.socket.remoteAddress)));
		const proxy = createServer();
		const proxySources: string[] = [];
		proxy.on('connect', (req, socket, head) => {
			proxySources.push((socket as Socket).remoteAddress!);
			const upstream = connect(destinationPort, '127.0.0.1', () => {
				socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				upstream.write(head);
				upstream.pipe(socket);
				socket.pipe(upstream);
			});
			sockets.add(upstream);
			upstream.on('error', () => socket.destroy());
			socket.on('error', () => upstream.destroy());
		});
		const proxyPort = await listen(proxy);
		const http = client({
			bindAddress: '127.0.0.2',
			addressFamily: 'ipv4',
			proxy: { url: `http://127.0.0.1:${proxyPort}`, bypassHosts: ['localhost'] },
		});
		await http.send(`http://127.0.0.1:${destinationPort}`);
		expect(proxySources).toEqual(['127.0.0.2']);
		expect(await (await http.send(`http://localhost:${destinationPort}`)).text()).toBe('127.0.0.2');
		expect(proxySources).toHaveLength(1);
	});

	test('decodes compressed responses and limits the decompressed body', async () => {
		const bytes = gzipSync('x'.repeat(1000));
		const port = await listen(
			createServer((_req, res) => {
				res.writeHead(200, { 'content-encoding': 'gzip', 'content-length': bytes.length }).end(bytes);
			}),
		);
		const http = client();
		expect(await (await http.send(`http://127.0.0.1:${port}`)).text()).toBe('x'.repeat(1000));
		await expect(http.send(`http://127.0.0.1:${port}`, { size: 100 })).rejects.toThrow(/size limit/);
	});
});
