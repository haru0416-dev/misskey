/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import type { IImageStreamable } from '@/core/ImageProcessingService.js';
import type { FileServerReply } from './FileServerTypes.js';

export type RangeStream = {
	stream: fs.ReadStream;
	start: number;
	end: number;
	chunksize: number;
};

export function createRangeStream(rangeHeader: string, size: number, path: string): RangeStream {
	const parts = rangeHeader.replace(/bytes=/, '').split('-');
	const start = Number.parseInt(parts[0] ?? '', 10);
	let end = parts[1] ? Number.parseInt(parts[1], 10) : size - 1;
	if (end > size) {
		end = size - 1;
	}
	const chunksize = end - start + 1;

	return {
		stream: fs.createReadStream(path, { start, end }),
		start,
		end,
		chunksize,
	};
}

/**
 * ストリームにcleanupハンドラを設定する
 * ストリームでない場合は即座にcleanupを実行する
 */
export function attachStreamCleanup(data: IImageStreamable['data'], cleanup: () => void): void {
	if ('pipe' in data && typeof data.pipe === 'function') {
		data.on('end', cleanup);
		data.on('close', cleanup);
	} else {
		cleanup();
	}
}

export function getSafeContentType(mime: string): string {
	return FILE_TYPE_BROWSERSAFE.includes(mime) ? mime : 'application/octet-stream';
}

export function handleRangeRequest(
	reply: FileServerReply,
	rangeHeader: string | undefined,
	size: number,
	path: string,
): fs.ReadStream {
	if (rangeHeader && size > 0) {
		const { stream, start, end, chunksize } = createRangeStream(rangeHeader, size, path);
		reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
		reply.header('Accept-Ranges', 'bytes');
		reply.header('Content-Length', chunksize);
		reply.code(206);
		return stream;
	}
	return fs.createReadStream(path);
}

export type FileResponseOptions = {
	mime: string;
	filename: string;
	size?: number;
	cacheControl?: string;
};

export function setFileResponseHeaders(
	reply: FileServerReply,
	options: FileResponseOptions,
): void {
	reply.header('Content-Type', getSafeContentType(options.mime));
	reply.header('Cache-Control', options.cacheControl ?? 'max-age=31536000, immutable');
	reply.header('Content-Disposition', contentDisposition('inline', options.filename));
	if (options.size !== undefined) {
		reply.header('Content-Length', options.size);
	}
}

export function needsCleanup<T extends { kind?: string; cleanup?: () => void }>(file: T): file is T & { cleanup: () => void } {
	return 'cleanup' in file && typeof file.cleanup === 'function';
}
