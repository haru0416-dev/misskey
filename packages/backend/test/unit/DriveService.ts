/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as http from 'node:http';
import * as https from 'node:https';
import { beforeAll, beforeEach, describe, test, expect } from 'vitest';
import {
	DeleteObjectCommand,
	DeleteObjectCommandOutput,
	InvalidObjectState,
	NoSuchKey,
	S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { DriveService } from '@/core/DriveService.js';
import { S3Service } from '@/core/S3Service.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type { MiMeta } from '@/models/Meta.js';

describe('DriveService', () => {
	let driveService: DriveService;
	const s3Mock = mockClient(S3Client);
	const meta = {
		objectStorageBucket: 'fake',
		objectStorageEndpoint: null,
		objectStorageUseSSL: true,
		objectStorageUseProxy: true,
		objectStorageAccessKey: null,
		objectStorageSecretKey: null,
		objectStorageRegion: 'us-east-1',
		objectStorageS3ForcePathStyle: false,
	} as MiMeta;

	beforeAll(() => {
		const httpRequestService = {
			getAgentByUrl: (url: URL) => url.protocol === 'https:' ? new https.Agent() : new http.Agent(),
		} as HttpRequestService;
		const s3Service = new S3Service(httpRequestService);
		const unused = undefined as never;
		driveService = new DriveService(
			unused,
			meta,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
			s3Service,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
		);
	});

	beforeEach(async () => {
		s3Mock.reset();
	});

	describe('Object storage', () => {
		test('delete a file', async () => {
			s3Mock.on(DeleteObjectCommand)
				.resolves({} as DeleteObjectCommandOutput);

			await driveService.deleteObjectStorageFile('peace of the world');
		});

		test('delete a file then unexpected error', async () => {
			s3Mock.on(DeleteObjectCommand)
				.rejects(new InvalidObjectState({ $metadata: {}, message: '' }));

			await expect(driveService.deleteObjectStorageFile('unexpected')).rejects.toThrow(Error);
		});

		test('delete a file with no valid key', async () => {
			// Some S3 implementations returns 404 Not Found on deleting with a non-existent key
			s3Mock.on(DeleteObjectCommand)
				.rejects(new NoSuchKey({ $metadata: {}, message: 'allowed error.' }));

			await driveService.deleteObjectStorageFile('lol no way');
		});
	});
});
