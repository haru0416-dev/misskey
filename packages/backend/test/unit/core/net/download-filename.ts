/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createDownloadService } from '@/core/net/DownloadService.js';
import { createHttpRequestService } from '@/core/net/HttpRequestService.js';
import { createLoggerService } from '@/core/LoggerService.js';
import { loadConfig } from '@/config.js';

/**
 * リモートが返す Content-Disposition からファイル名を取り出す経路。
 *
 * 値は相手が自由に決められるので、壊れたヘッダで例外にせず URL 由来の名前へ落ちること、
 * RFC 5987 の拡張形式 (filename*) を復号することを実サーバー相手に確かめる。
 */
describe('core:net:DownloadService のファイル名決定', () => {
	let server: Server;
	let port = 0;
	let header: string | null = null;
	let tmpDir = '';

	beforeAll(async () => {
		server = createServer((_req, res) => {
			const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
			if (header != null) headers['content-disposition'] = header;
			res.writeHead(200, headers);
			res.end('body');
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		port = (server.address() as AddressInfo).port;
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dl-'));
	});

	afterAll(async () => {
		await new Promise<void>((r) => server.close(() => r()));
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	afterEach(() => {
		header = null;
	});

	function service() {
		const config = loadConfig();
		const patched = {
			...config,
			outboundNetwork: {
				...config.outboundNetwork,
				privateNetworkAccess: { ...config.outboundNetwork.privateNetworkAccess, allowedNetworks: ['127.0.0.0/8'] },
				proxy: { ...config.outboundNetwork.proxy, url: null },
			},
		} as unknown as typeof config;
		return createDownloadService(patched, createHttpRequestService(patched), createLoggerService());
	}

	let seq = 0;
	const download = async (urlPath: string) => {
		const dest = path.join(tmpDir, `out-${seq++}`);
		const result = await service().downloadUrl(`http://127.0.0.1:${port}${urlPath}`, dest);
		return result.filename;
	};

	test('ヘッダが無ければ URL のパス末尾を使う', async () => {
		await expect(download('/dir/from-url.bin')).resolves.toBe('from-url.bin');
	});

	test('filename をそのまま使う', async () => {
		header = 'attachment; filename="from-header.png"';
		await expect(download('/dir/from-url.bin')).resolves.toBe('from-header.png');
	});

	test('filename* (RFC 5987) を復号して使う', async () => {
		header = "attachment; filename*=UTF-8''%E7%8C%AB.png";
		await expect(download('/dir/from-url.bin')).resolves.toBe('猫.png');
	});

	test('壊れた filename* では URL 由来の名前へ落ちる', async () => {
		// percent-encoding が不正なので復号できない。例外にはしない。
		header = "attachment; filename*=UTF-8''%ZZ.png";
		await expect(download('/dir/from-url.bin')).resolves.toBe('from-url.bin');
	});

	test('filename が空なら URL 由来の名前へ落ちる', async () => {
		// `filename=` は空文字として解析される。これを採ると名前が消える。
		header = 'attachment; filename=';
		await expect(download('/dir/from-url.bin')).resolves.toBe('from-url.bin');
	});

	test('パラメータの無い壊れたヘッダでも例外にしない', async () => {
		header = 'attachment;;;';
		await expect(download('/dir/from-url.bin')).resolves.toBe('from-url.bin');
	});
});
