/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import type { IImageStreamable } from '@/core/drive/ImageProcessingService.js';
import type { FileServerReply } from './FileServerTypes.js';

export type RangeStream = {
	stream: fs.ReadStream;
	start: number;
	end: number;
	chunksize: number;
};

export function parseRange(rangeHeader: string, size: number): { start: number; end: number; chunksize: number } {
	const parts = rangeHeader.replace(/bytes=/, '').split('-');
	const start = Number.parseInt(parts[0] ?? '', 10);
	let end = parts[1] ? Number.parseInt(parts[1], 10) : size - 1;
	if (end > size) {
		end = size - 1;
	}
	return { start, end, chunksize: end - start + 1 };
}

export function createRangeStream(rangeHeader: string, size: number, path: string): RangeStream {
	const { start, end, chunksize } = parseRange(rangeHeader, size);
	return {
		stream: fs.createReadStream(path, { start, end }),
		start,
		end,
		chunksize,
	};
}

/**
 * Range に応じないリモートの全体応答から、要求された範囲だけを流す。範囲を送り終えたら上流を止める。
 */
export function sliceStream(source: Readable, start: number, end: number): Readable {
	let offset = 0;
	const sliced = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			const from = Math.max(start - offset, 0);
			const to = Math.min(end + 1 - offset, chunk.length);
			offset += chunk.length;
			if (from < to) {
				this.push(chunk.subarray(from, to));
			}
			if (offset > end) {
				// pipeline で上流を壊すと下流の未送信分も捨てられるので、切り離してから止める。
				source.unpipe(sliced);
				source.destroy();
				this.push(null);
			}
			callback();
		},
	});
	source.on('error', (err) => sliced.destroy(err));
	sliced.on('close', () => source.destroy());
	source.pipe(sliced);
	return sliced;
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

/**
 * ファイルの本文を返し、長さのヘッダもここで決める。Range があれば 206 と部分長、無ければ全体長にする。
 * 呼び出し側で Content-Length を書き足すと、206 の部分長を全体長で上書きしてしまい動画の再生が始まらない。
 */
export function handleRangeRequest(
	reply: FileServerReply,
	rangeHeader: string | undefined,
	size: number,
	path: string,
): fs.ReadStream {
	reply.header('Accept-Ranges', 'bytes');
	if (rangeHeader && size > 0) {
		const { stream, start, end, chunksize } = createRangeStream(rangeHeader, size, path);
		reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
		reply.header('Content-Length', chunksize);
		reply.code(206);
		return stream;
	}
	reply.header('Content-Length', size);
	return fs.createReadStream(path);
}

export type FileResponseOptions = {
	mime: string;
	filename: string;
	cacheControl?: string;
};

export function setFileResponseHeaders(reply: FileServerReply, options: FileResponseOptions): void {
	reply.header('Content-Type', getSafeContentType(options.mime));
	reply.header('Cache-Control', options.cacheControl ?? 'max-age=31536000, immutable');
	reply.header('Content-Disposition', contentDisposition('inline', options.filename));
}

export function needsCleanup<T extends { kind?: string; cleanup?: () => void }>(
	file: T,
): file is T & { cleanup: () => void } {
	return 'cleanup' in file && typeof file.cleanup === 'function';
}
