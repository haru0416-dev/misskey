/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as http from 'node:http';
import * as https from 'node:https';
import { beforeAll, beforeEach, describe, test, expect } from 'vitest';
import {
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Service } from '@/core/S3Service.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { MiMeta } from '@/models/_.js';

describe('S3Service', () => {
	let s3Service: S3Service;
	const s3Mock = mockClient(S3Client);
	const meta = (overrides: Partial<MiMeta> = {}) => ({
		objectStorageEndpoint: null,
		objectStorageUseSSL: true,
		objectStorageUseProxy: true,
		objectStorageAccessKey: null,
		objectStorageSecretKey: null,
		objectStorageRegion: null,
		objectStorageS3ForcePathStyle: false,
		...overrides,
	}) as MiMeta;

	beforeAll(() => {
		const httpRequestService = {
			getAgentByUrl: (url: URL) => url.protocol === 'https:' ? new https.Agent() : new http.Agent(),
		} as HttpRequestService;
		s3Service = new S3Service(httpRequestService);
	});

	beforeEach(async () => {
		s3Mock.reset();
	});

	describe('upload', () => {
		test('upload a file', async () => {
			s3Mock.on(PutObjectCommand).resolves({});

			await s3Service.upload(meta({ objectStorageRegion: 'us-east-1' }), {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x',
			});
		});

		test('upload a large file', async () => {
			s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: '1' });
			s3Mock.on(UploadPartCommand).resolves({ ETag: '1' });
			s3Mock.on(CompleteMultipartUploadCommand).resolves({ Bucket: 'fake', Key: 'fake' });

			await s3Service.upload(meta(), {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x'.repeat(8 * 1024 * 1024 + 1), // デフォルトpartSizeにしている 8 * 1024 * 1024 を越えるサイズ
			});
		});

		test('upload a file error', async () => {
			s3Mock.on(PutObjectCommand).rejects({ name: 'Fake Error' });

			await expect(s3Service.upload(meta({ objectStorageRegion: 'us-east-1' }), {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x',
			})).rejects.toThrow(Error);
		});

		test('upload a large file error', async () => {
			s3Mock.on(UploadPartCommand).rejects();

			await expect(s3Service.upload(meta(), {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x'.repeat(8 * 1024 * 1024 + 1), // デフォルトpartSizeにしている 8 * 1024 * 1024 を越えるサイズ
			})).rejects.toThrow(Error);
		});
	});
});
