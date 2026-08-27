/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createS3Service, type S3Service } from '@/core/drive/S3Service.js';
import { MiMeta } from '@/models/_.js';

type CapturedRequest = { method: string; url: string; headers: Record<string, string>; body: string };

describe('S3Service', () => {
	let s3Service: S3Service;
	let server: Server;
	let endpoint: string;
	let requests: CapturedRequest[] = [];

	// Bun.S3Client にはモックの差し込み口が無いので、S3 互換の応答を返すだけの
	// ループバックサーバーへ向けて、実際に飛ぶリクエストを見る。
	beforeAll(async () => {
		server = createServer((req, res) => {
			const chunks: Buffer[] = [];
			req.on('data', (c: Buffer) => chunks.push(c));
			req.on('end', () => {
				requests.push({
					method: req.method ?? '',
					url: req.url ?? '',
					headers: req.headers as Record<string, string>,
					body: Buffer.concat(chunks).toString('utf8'),
				});
				res.setHeader('ETag', '"fake"');
				res.statusCode = req.method === 'DELETE' ? 204 : 200;
				res.end();
			});
		});
		await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
		// 仮想ホスト形式では `fake.<host>` へ繋ぐので、サブドメインが解決する localhost を使う。
		endpoint = `localhost:${(server.address() as AddressInfo).port}`;
		s3Service = createS3Service();
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	beforeEach(() => {
		requests = [];
	});

	const meta = (overrides: Partial<MiMeta> = {}) =>
		({
			objectStorageBucket: 'fake',
			objectStorageEndpoint: endpoint,
			objectStorageUseSSL: false,
			objectStorageAccessKey: 'key',
			objectStorageSecretKey: 'secret',
			objectStorageRegion: 'us-east-1',
			objectStorageS3ForcePathStyle: true,
			objectStorageSetPublicRead: false,
			...overrides,
		}) as MiMeta;

	describe('upload', () => {
		test('PUT でオブジェクトを書き、Content-Type を送る', async () => {
			await s3Service.upload(meta(), {
				key: 'dir/file.png',
				body: new TextEncoder().encode('x'),
				contentType: 'image/png',
				publicRead: false,
			});

			expect(requests).toHaveLength(1);
			const req = requests[0]!;
			expect(req.method).toBe('PUT');
			// forcePathStyle なのでバケットはパスに入る。
			expect(req.url).toBe('/fake/dir/file.png');
			expect(req.headers['content-type']).toBe('image/png');
			expect(req.headers['authorization']).toMatch(/^AWS4-HMAC-SHA256 /);
			expect(req.body).toBe('x');
		});

		test('publicRead のときだけ ACL ヘッダを送る', async () => {
			await s3Service.upload(meta(), {
				key: 'a',
				body: new Uint8Array([1]),
				contentType: 'text/plain',
				publicRead: false,
			});
			expect(requests[0]!.headers['x-amz-acl']).toBeUndefined();

			requests = [];
			await s3Service.upload(meta(), {
				key: 'a',
				body: new Uint8Array([1]),
				contentType: 'text/plain',
				publicRead: true,
			});
			expect(requests[0]!.headers['x-amz-acl']).toBe('public-read');
		});

		test('contentDisposition を送る', async () => {
			await s3Service.upload(meta(), {
				key: 'a',
				body: new Uint8Array([1]),
				contentType: 'text/plain',
				contentDisposition: 'inline; filename="x.txt"',
				publicRead: false,
			});
			expect(requests[0]!.headers['content-disposition']).toBe('inline; filename="x.txt"');
		});

		test('forcePathStyle を切るとバケットがパスから外れる', async () => {
			await s3Service.upload(meta({ objectStorageS3ForcePathStyle: false }), {
				key: 'a',
				body: new Uint8Array([1]),
				contentType: 'text/plain',
				publicRead: false,
			});

			expect(requests).toHaveLength(1);
			// 仮想ホスト形式ではバケットはホスト名側に付き、パスからは消える。
			expect(requests[0]!.url).toBe('/a');
			expect(requests[0]!.headers['host']).toBe(`fake.${endpoint}`);
		});
	});

	describe('delete', () => {
		test('DELETE を送る', async () => {
			await s3Service.delete(meta(), { key: 'dir/file.png' });

			expect(requests).toHaveLength(1);
			expect(requests[0]!.method).toBe('DELETE');
			expect(requests[0]!.url).toBe('/fake/dir/file.png');
		});
	});

	test('バケット未設定なら送信前に失敗する', () => {
		expect(() => s3Service.getS3Client(meta({ objectStorageBucket: null }))).toThrow(/bucket is not configured/);
	});
});
