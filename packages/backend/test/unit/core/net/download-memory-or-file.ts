/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createDownloadService } from '@/core/net/DownloadService.js';
import { createHttpRequestService } from '@/core/net/HttpRequestService.js';
import { createLoggerService } from '@/core/LoggerService.js';
import { loadConfig } from '@/config.js';

// メディアプロキシは小さい画像をメモリに受け、上限を超えた分だけ一時ファイルに逃がす。
// 切り替えがチャンクの途中で起きても中身が欠けないこと、全体の上限超過は切り替え後も拒否されることを確かめる。
describe('core:net:DownloadService のメモリ受け取り', () => {
	let server: Server;
	let port = 0;
	// 64KiB ずつ 4 回送る。位置ごとに値を変え、欠けや順序の入れ替わりを検出できるようにする。
	const chunkSize = 64 * 1024;
	const body = Buffer.from(Array.from({ length: chunkSize * 4 }, (_, i) => i % 251));

	beforeAll(async () => {
		server = createServer(async (_req, res) => {
			res.writeHead(200, { 'content-type': 'application/octet-stream' });
			for (let i = 0; i < body.length; i += chunkSize) {
				res.write(body.subarray(i, i + chunkSize));
				await new Promise((r) => setTimeout(r, 5));
			}
			res.end();
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		port = (server.address() as AddressInfo).port;
	});

	afterAll(async () => {
		await new Promise<void>((r) => server.close(() => r()));
	});

	function service(maximumFileSizeBytes?: number) {
		const config = loadConfig();
		const patched = {
			...config,
			limits: { ...config.limits, maximumFileSizeBytes: maximumFileSizeBytes ?? config.limits.maximumFileSizeBytes },
			outboundNetwork: {
				...config.outboundNetwork,
				privateNetworkAccess: { ...config.outboundNetwork.privateNetworkAccess, allowedNetworks: ['127.0.0.0/8'] },
				proxy: { ...config.outboundNetwork.proxy, url: null },
			},
		} as unknown as typeof config;
		return createDownloadService(patched, createHttpRequestService(patched), createLoggerService());
	}

	test('上限以内ならメモリに受け、一時ファイルを作らない', async () => {
		const result = await service().downloadUrlToMemoryOrFile(`http://127.0.0.1:${port}/a.bin`, body.length);
		expect('data' in result && result.data.equals(body)).toBe(true);
		expect('path' in result).toBe(false);
	});

	test('上限を超えたら一時ファイルに切り替え、受け取り済みの分も含めて全体を書く', async () => {
		const result = await service().downloadUrlToMemoryOrFile(`http://127.0.0.1:${port}/a.bin`, 100 * 1024);
		if (!('path' in result)) throw new Error('一時ファイルに切り替わっていない');
		try {
			expect((await fs.promises.readFile(result.path)).equals(body)).toBe(true);
		} finally {
			result.cleanup();
		}
	});

	test('切り替え後も全体の上限を超えたら 413 で拒否する', async () => {
		const download = service(200 * 1024).downloadUrlToMemoryOrFile(`http://127.0.0.1:${port}/a.bin`, 100 * 1024);
		await expect(download).rejects.toMatchObject({ statusCode: 413 });
	});
});
