/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


import * as assert from 'assert';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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

		expect(res.status).toBe(204);
		expect(file.name).toBe('192.jpg');
		expect(file.type).toBe('image/jpeg');
	});

	test('ローカルからアップロードできる', async () => {
		// APIレスポンスを直接使用するので utils.js uploadFile が通過することで成功とする

		const res = await uploadFile(alice, { path: '192.jpg', name: 'テスト画像' });

		expect(res.body).toMatchObject({ name: 'テスト画像.jpg', type: 'image/jpeg' });
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
		expect(attached0.body.length).toBe(2);
		expect(attached0.body[0]?.id).toBe(note1.id);
		expect(attached0.body[1]?.id).toBe(note0.id);

		const attached1 = await api('drive/files/attached-notes', { fileId: fileId1 }, alice);
		expect(attached1.body.length).toBe(1);
		expect(attached1.body[0]?.id).toBe(note1.id);

		const attached2 = await api('drive/files/attached-notes', { fileId: fileId2 }, alice);
		expect(attached2.body.length).toBe(0);
	});

	test('添付ノート一覧は他の人から見えない', async () => {
		const file = await uploadFile(alice);

		await post(alice, { fileIds: [file.body!.id] });

		const res = await api('drive/files/attached-notes', { fileId: file.body!.id }, bob);
		expect(res.status).toBe(400);
		expect('error' in res.body).toBe(true);
	});
});
