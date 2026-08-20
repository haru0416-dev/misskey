/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { join } from 'node:path';
import { ffprobe, runFfmpeg } from '@/misc/ffmpeg.js';
import type { Config } from '@/config.js';
import { ImageProcessingService } from '@/core/ImageProcessingService.js';
import type { IImage } from '@/core/ImageProcessingService.js';
import { createTempDir } from '@/misc/create-temp.js';
import { appendQuery, query } from '@/misc/prelude/url.js';

export function createVideoProcessingService(config: Config, imageProcessingService: ImageProcessingService) {
	async function generateVideoThumbnail(source: string): Promise<IImage> {
		const [dir, cleanup] = await createTempDir();

		try {
			// 動画長の 5% 地点のフレームを切り出す。
			const duration = Number((await ffprobe(source).catch(() => null))?.format.duration);
			const seek = Number.isFinite(duration) ? duration * 0.05 : 0;

			await runFfmpeg(['-ss', seek.toFixed(3), '-i', source, '-frames:v', '1', '-y', join(dir, 'out.png')]);

			return await imageProcessingService.convertToWebp(`${dir}/out.png`, 498, 422);
		} finally {
			cleanup();
		}
	}

	function getExternalVideoThumbnailUrl(url: string): string | null {
		if (config.media.videoThumbnailGeneratorUrl == null) return null;

		return appendQuery(
			`${config.media.videoThumbnailGeneratorUrl}/thumbnail.webp`,
			query({
				thumbnail: '1',
				url,
			}),
		);
	}

	return { generateVideoThumbnail, getExternalVideoThumbnailUrl };
}

export type VideoProcessingService = ReturnType<typeof createVideoProcessingService>;
