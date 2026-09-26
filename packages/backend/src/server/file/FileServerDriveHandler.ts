/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { basename, extname } from 'node:path';
import type { Config } from '@/config.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import type { VideoProcessingService } from '@/core/drive/VideoProcessingService.js';
import {
	attachStreamCleanup,
	handleRangeRequest,
	parseRange,
	setFileResponseHeaders,
	getSafeContentType,
	sliceStream,
} from './FileServerUtils.js';
import type { FileResolveResult, FileServerFileResolver } from './FileServerFileResolver.js';
import { getFileServerHeader } from './FileServerTypes.js';
import type { FileServerReply, FileServerRequest } from './FileServerTypes.js';

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

		if (file.kind === 'remote') {
			return await this.handleRemote(file, request, reply);
		}

		if (file.fileRole !== 'original') {
			const suffix = file.fileRole === 'thumbnail' ? '-thumb' : '-web';
			const ext = file.ext ? `.${file.ext}` : '.unknown';
			const filename = basename(file.filename, extname(file.filename)) + suffix + ext;

			setFileResponseHeaders(reply, { mime: file.mime, filename });
			return handleRangeRequest(reply, getFileServerHeader(request.headers, 'range'), file.file.size, file.path);
		}
		setFileResponseHeaders(reply, { mime: file.file.type, filename: file.filename });
		return handleRangeRequest(reply, getFileServerHeader(request.headers, 'range'), file.file.size, file.path);
	}

	/**
	 * 保存していないリモートのファイル。サムネイルと SVG はメディアプロキシへ回し、それ以外は保存せずに中継する。
	 * 要求ごとに全体を一時ファイルへ取ると、動画のシーク 1 回ごとに全体を取り直してディスクに書くことになる。
	 */
	private async handleRemote(
		file: Extract<FileResolveResult, { kind: 'remote' }>,
		request: FileServerRequest<{ key: string }>,
		reply: FileServerReply,
	) {
		if (file.fileRole === 'thumbnail') {
			if (isMimeImage(file.mime, 'sharp-convertible-image-with-bmp')) {
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				const url = new URL(`${this.config.media.proxyUrl}/static.webp`);
				url.searchParams.set('url', file.url);
				url.searchParams.set('static', '1');
				return await reply.redirect(url.toString(), 301);
			}
			if (file.mime.startsWith('video/')) {
				const externalThumbnail = this.videoProcessingService.getExternalVideoThumbnailUrl(file.url);
				if (externalThumbnail) {
					return await reply.redirect(externalThumbnail, 301);
				}
				return await this.sendVideoThumbnail(file, reply);
			}
		}

		if (file.fileRole === 'webpublic' && file.mime === 'image/svg+xml') {
			reply.header('Cache-Control', 'max-age=31536000, immutable');
			const url = new URL(`${this.config.media.proxyUrl}/svg.webp`);
			url.searchParams.set('url', file.url);
			return await reply.redirect(url.toString(), 301);
		}

		const forward: Record<string, string> = {};
		for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
			const value = getFileServerHeader(request.headers, name);
			if (value != null) forward[name] = value;
		}
		const remote = await this.fileResolver.openRemoteStream(file.url, forward);

		reply.header('Content-Type', getSafeContentType(file.mime));
		reply.header('Cache-Control', 'max-age=31536000, immutable');
		reply.header('Content-Disposition', contentDisposition('inline', correctFilename(file.filename, null)));
		reply.header('Accept-Ranges', 'bytes');
		for (const name of ['etag', 'last-modified']) {
			reply.header(name, remote.headers.get(name) ?? undefined);
		}

		if (remote.status === 304) {
			remote.body.destroy();
			reply.code(304);
			return null;
		}

		const length = remote.headers.get('content-length');
		if (remote.status === 206) {
			reply.code(206);
			reply.header('Content-Range', remote.headers.get('content-range') ?? undefined);
			reply.header('Content-Length', length ?? undefined);
			return remote.body;
		}

		// Range に応じないリモートは全体を返すので、要求範囲だけを切り出す。
		const range = forward['range'];
		if (range != null && length != null) {
			const { start, end, chunksize } = parseRange(range, Number(length));
			reply.code(206);
			reply.header('Content-Range', `bytes ${start}-${end}/${length}`);
			reply.header('Content-Length', chunksize);
			return sliceStream(remote.body, start, end);
		}

		reply.header('Content-Length', length ?? undefined);
		return remote.body;
	}

	/** 動画のサムネイルは ffmpeg にファイルを渡す必要があるので、ここだけ一時ファイルに取得する。 */
	private async sendVideoThumbnail(file: Extract<FileResolveResult, { kind: 'remote' }>, reply: FileServerReply) {
		const downloaded = await this.fileResolver.downloadAndDetectTypeFromUrl(file.url);
		try {
			const image = await this.videoProcessingService.generateVideoThumbnail(downloaded.path);
			attachStreamCleanup(image.data, downloaded.cleanup);
			reply.header('Content-Type', getSafeContentType(image.type));
			reply.header('Cache-Control', 'max-age=31536000, immutable');
			reply.header('Content-Disposition', contentDisposition('inline', correctFilename(file.filename, image.ext)));
			return image.data;
		} catch (e) {
			downloaded.cleanup();
			throw e;
		}
	}
}
