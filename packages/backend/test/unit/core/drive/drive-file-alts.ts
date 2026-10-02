/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { generateDriveFileAlts } from '@/core/drive/drive-file-upload-logic.js';
import { createImageProcessingService } from '@/core/drive/image-processing-service.js';
import type { Config } from '@/config.js';

// Web 用画像 (拡大表示用) は設定で画質と CPU を選び、サムネイルは常に smartSubsample を使わない。
describe('generateDriveFileAlts の WebP 設定', () => {
	let dir: string;
	let photo: string;

	beforeAll(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-alts-'));
		photo = path.join(dir, 'photo.jpg');
		// 2048px を超えるので Web 用画像を作る経路に入る。
		await sharp({ create: { width: 2600, height: 1800, channels: 3, background: { r: 200, g: 40, b: 40 } } })
			.jpeg()
			.toFile(photo);
	});

	afterAll(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	async function optionsFor(webpublicSmartSubsample: boolean) {
		const imageProcessingService = createImageProcessingService();
		const convert = vi.spyOn(imageProcessingService, 'convertSharpToWebp');
		const alts = await generateDriveFileAlts(
			{
				config: { media: { webpublicSmartSubsample, videoThumbnailGeneratorUrl: null } } as unknown as Config,
				imageProcessingService,
				videoProcessingService: {} as never,
			},
			photo,
			'image/jpeg',
			true,
		);
		expect(alts.webpublic).not.toBeNull();
		expect(alts.thumbnail).not.toBeNull();
		const [webpublic, thumbnail] = convert.mock.calls;
		return {
			webpublic: webpublic![3]?.smartSubsample,
			thumbnail: thumbnail![3]?.smartSubsample,
			sizes: [webpublic![1], thumbnail![1]],
		};
	}

	test('Web 用画像は設定に従い、サムネイルは常に間引かない', async () => {
		expect(await optionsFor(true)).toStrictEqual({ webpublic: true, thumbnail: false, sizes: [2048, 498] });
		expect(await optionsFor(false)).toStrictEqual({ webpublic: false, thumbnail: false, sizes: [2048, 498] });
	});
});
