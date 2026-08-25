/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';

import * as assert from 'assert';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, beforeAll, test } from 'vitest';
import { api, makeStreamCatcher, parseUploadedDriveFile, post, signup, uploadFile } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Drive', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	// upload-from-url は URL からの取得そのものが検査対象なので、配信元をループバックに置く。
	// 外部ホストに置くと、ネットワーク断や配信元の移動でこのテストだけが落ちる。
	let imageServer: Server;
	let imageUrl: string;

	beforeAll(
		async () => {
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });

			const jpeg = await readFile(fileURLToPath(new URL('../resources/192.jpg', import.meta.url)));
			await new Promise<void>((resolve) => {
				imageServer = createServer((_req, res) => {
					res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': jpeg.byteLength });
					res.end(jpeg);
				});
				imageServer.listen(0, '127.0.0.1', () => resolve());
			});
			imageUrl = `http://127.0.0.1:${(imageServer.address() as AddressInfo).port}/192.jpg`;
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await new Promise<void>((resolve) => imageServer.close(() => resolve()));
	});

	test('ファイルURLからアップロードできる', async () => {
		// utils.js uploadUrl の処理だがAPIレスポンスも見るためここで同様の処理を書いている

		const marker = Math.random().toString();

		const catcher = makeStreamCatcher(
			alice,
			'main',
			(msg) => msg.type === 'urlUploadFinished' && msg.body['marker'] === marker,
			(msg) => parseUploadedDriveFile(msg.body['file']),
			10 * 1000,
		);

		const res = await api(
			'drive/files/upload-from-url',
			{
				url: imageUrl,
				marker,
				force: true,
			},
			alice,
		);

		const file = await catcher;

		assert.strictEqual(res.status, 204);
		assert.strictEqual(file.name, '192.jpg');
		assert.strictEqual(file.type, 'image/jpeg');
	});

	test('ローカルからアップロードできる', async () => {
		// APIレスポンスを直接使用するので utils.js uploadFile が通過することで成功とする

		const res = await uploadFile(alice, { path: '192.jpg', name: 'テスト画像' });

		assert.strictEqual(res.body?.name, 'テスト画像.jpg');
		assert.strictEqual(res.body.type, 'image/jpeg');
	});

	test('添付ノート一覧を取得できる', async () => {
		const ids = (await Promise.all([uploadFile(alice), uploadFile(alice), uploadFile(alice)])).map(
			(elm) => elm.body!.id,
		);
		const [fileId0, fileId1, fileId2] = ids;
		assert.ok(fileId0 && fileId1 && fileId2);

		const note0 = await post(alice, { fileIds: [fileId0] });
		const note1 = await post(alice, { fileIds: [fileId0, fileId1] });

		const attached0 = await api('drive/files/attached-notes', { fileId: fileId0 }, alice);
		assert.strictEqual(attached0.body.length, 2);
		assert.strictEqual(attached0.body[0]?.id, note1.id);
		assert.strictEqual(attached0.body[1]?.id, note0.id);

		const attached1 = await api('drive/files/attached-notes', { fileId: fileId1 }, alice);
		assert.strictEqual(attached1.body.length, 1);
		assert.strictEqual(attached1.body[0]?.id, note1.id);

		const attached2 = await api('drive/files/attached-notes', { fileId: fileId2 }, alice);
		assert.strictEqual(attached2.body.length, 0);
	});

	test('添付ノート一覧は他の人から見えない', async () => {
		const file = await uploadFile(alice);

		await post(alice, { fileIds: [file.body!.id] });

		const res = await api('drive/files/attached-notes', { fileId: file.body!.id }, bob);
		assert.strictEqual(res.status, 400);
		assert.strictEqual('error' in res.body, true);
	});
});
