/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import FFmpeg from 'fluent-ffmpeg';
import type { Config } from '@/config.js';
import { ImageProcessingService } from '@/core/ImageProcessingService.js';
import type { IImage } from '@/core/ImageProcessingService.js';
import { createTempDir } from '@/misc/create-temp.js';
import { appendQuery, query } from '@/misc/prelude/url.js';

export function createVideoProcessingService(
	config: Config,
	imageProcessingService: ImageProcessingService,
) {
	async function generateVideoThumbnail(source: string): Promise<IImage> {
		const [dir, cleanup] = await createTempDir();

		try {
			await new Promise((res, rej) => {
				FFmpeg({
					source,
				})
					.on('end', res)
					.on('error', rej)
					.screenshot({
						folder: dir,
						filename: 'out.png',	// must have .png extension
						count: 1,
						timestamps: ['5%'],
					});
			});

			return await imageProcessingService.convertToWebp(`${dir}/out.png`, 498, 422);
		} finally {
			cleanup();
		}
	}

	function getExternalVideoThumbnailUrl(url: string): string | null {
		if (config.videoThumbnailGenerator == null) return null;

		return appendQuery(
			`${config.videoThumbnailGenerator}/thumbnail.webp`,
			query({
				thumbnail: '1',
				url,
			}),
		);
	}

	return { generateVideoThumbnail, getExternalVideoThumbnailUrl };
}

export type VideoProcessingService = ReturnType<typeof createVideoProcessingService>;
