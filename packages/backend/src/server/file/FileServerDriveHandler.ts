/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { basename, extname } from 'node:path';
import type { Config } from '@/config.js';
import type { IImageStreamable } from '@/core/drive/ImageProcessingService.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import { VideoProcessingService } from '@/core/drive/VideoProcessingService.js';
import {
	attachStreamCleanup,
	handleRangeRequest,
	setFileResponseHeaders,
	getSafeContentType,
} from './FileServerUtils.js';
import type { FileServerFileResolver } from './FileServerFileResolver.js';
import { getFileServerHeader, type FileServerReply, type FileServerRequest } from './FileServerTypes.js';

export class FileServerDriveHandler {
	constructor(
		private config: Config,
		private fileResolver: FileServerFileResolver,
		private assetsPath: string,
		private videoProcessingService: VideoProcessingService,
	) {}

	public async handle(request: FileServerRequest<{ key: string }>, reply: FileServerReply) {
		const key = request.params.key;
		const file = await this.fileResolver.resolveFileByAccessKey(key);

		if (file.kind === 'not-found') {
			reply.code(404);
			reply.header('Cache-Control', 'max-age=86400');
			return reply.sendFile('/dummy.png', this.assetsPath);
		}

		if (file.kind === 'unavailable') {
			reply.code(204);
			reply.header('Cache-Control', 'max-age=86400');
			return;
		}

		try {
			if (file.kind === 'remote') {
				let image: IImageStreamable | null = null;

				if (file.fileRole === 'thumbnail') {
					if (isMimeImage(file.mime, 'sharp-convertible-image-with-bmp')) {
						reply.header('Cache-Control', 'max-age=31536000, immutable');

						const url = new URL(`${this.config.media.proxyUrl}/static.webp`);
						url.searchParams.set('url', file.url);
						url.searchParams.set('static', '1');

						file.cleanup();
						return await reply.redirect(url.toString(), 301);
					} else if (file.mime.startsWith('video/')) {
						const externalThumbnail = this.videoProcessingService.getExternalVideoThumbnailUrl(file.url);
						if (externalThumbnail) {
							file.cleanup();
							return await reply.redirect(externalThumbnail, 301);
						}

						image = await this.videoProcessingService.generateVideoThumbnail(file.path);
					}
				}

				if (file.fileRole === 'webpublic') {
					if (['image/svg+xml'].includes(file.mime)) {
						reply.header('Cache-Control', 'max-age=31536000, immutable');

						const url = new URL(`${this.config.media.proxyUrl}/svg.webp`);
						url.searchParams.set('url', file.url);

						file.cleanup();
						return await reply.redirect(url.toString(), 301);
					}
				}

				image ??= {
					data: handleRangeRequest(reply, getFileServerHeader(request.headers, 'range'), file.file.size, file.path),
					ext: file.ext,
					type: file.mime,
				};

				attachStreamCleanup(image.data, file.cleanup);

				reply.header('Content-Type', getSafeContentType(image.type));
				reply.header('Content-Length', file.file.size);
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				reply.header('Content-Disposition', contentDisposition('inline', correctFilename(file.filename, image.ext)));
				return image.data;
			}

			if (file.fileRole !== 'original') {
				const suffix = file.fileRole === 'thumbnail' ? '-thumb' : '-web';
				const ext = file.ext ? `.${file.ext}` : '.unknown';
				const filename = basename(file.filename, extname(file.filename)) + suffix + ext;

				setFileResponseHeaders(reply, { mime: file.mime, filename });
				return handleRangeRequest(reply, getFileServerHeader(request.headers, 'range'), file.file.size, file.path);
			} else {
				setFileResponseHeaders(reply, { mime: file.file.type, filename: file.filename, size: file.file.size });
				return handleRangeRequest(reply, getFileServerHeader(request.headers, 'range'), file.file.size, file.path);
			}
		} catch (e) {
			if (file.kind === 'remote') file.cleanup();
			throw e;
		}
	}
}
