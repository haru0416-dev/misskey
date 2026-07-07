/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as stream from 'node:stream';
import { pipeline } from 'node:stream/promises';
import chalk from 'chalk';
import { parse } from 'content-disposition';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { createTemp } from '@/misc/create-temp.js';
import { StatusError } from '@/misc/status-error.js';
import { LoggerService } from '@/core/LoggerService.js';

export function createDownloadService(
	config: Config,
	httpRequestService: HttpRequestService,
	loggerService: LoggerService,
) {
	const logger = loggerService.getLogger('download');

	async function downloadUrl(url: string, path: string): Promise<{
		filename: string;
	}> {
		logger.info(`Downloading ${chalk.cyan(url)} to ${chalk.cyanBright(path)} ...`);

		const responseTimeout = 30 * 1000;
		const operationTimeout = 60 * 1000;
		const maxSize = config.maxFileSize;

		const urlObj = new URL(url);
		let filename = urlObj.pathname.split('/').pop() ?? 'untitled';

		const controller = new AbortController();
		const operationTimer = setTimeout(() => controller.abort(), operationTimeout);
		// レスポンスヘッダ受信までのタイムアウト (fetch 解決後に解除される)
		const responseTimer = setTimeout(() => controller.abort(), responseTimeout);

		try {
			const res = await httpRequestService.fetchFollowingRedirects(url, {
				method: 'GET',
				headers: {
					'User-Agent': config.userAgent,
				},
				body: undefined,
				signal: controller.signal,
			}, false).finally(() => clearTimeout(responseTimer));

			if (!res.ok) {
				await res.body?.cancel().catch(() => {});
				throw new StatusError(`${res.status} ${res.statusText}`, res.status, res.statusText);
			}

			const contentLength = res.headers.get('content-length');
			if (contentLength != null) {
				const size = Number(contentLength);
				if (size > maxSize) {
					logger.warn(`maxSize exceeded (${size} > ${maxSize}) on response`);
					await res.body?.cancel().catch(() => {});
					throw new StatusError(`Payload Too Large (${size} > ${maxSize})`, 413, 'Payload Too Large');
				}
			}

			const contentDisposition = res.headers.get('content-disposition');
			if (contentDisposition != null) {
				try {
					const parsed = parse(contentDisposition);
					if (parsed.parameters.filename) {
						filename = parsed.parameters.filename;
					}
				} catch (e) {
					logger.warn(`Failed to parse content-disposition: ${contentDisposition}`, { stack: e });
				}
			}

			let transferred = 0;
			const limitSize = new stream.Transform({
				transform(chunk: Buffer, _encoding, callback) {
					transferred += chunk.length;
					if (transferred > maxSize) {
						logger.warn(`maxSize exceeded (${transferred} > ${maxSize}) on download`);
						callback(new StatusError(`Payload Too Large (${transferred} > ${maxSize})`, 413, 'Payload Too Large'));
						return;
					}
					callback(null, chunk);
				},
			});

			const body = res.body != null
				? stream.Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
				: stream.Readable.from([]);
			await pipeline(body, limitSize, fs.createWriteStream(path));
		} finally {
			clearTimeout(operationTimer);
			clearTimeout(responseTimer);
		}

		logger.succ(`Download finished: ${chalk.cyan(url)}`);

		return {
			filename,
		};
	}

	async function downloadTextFile(url: string): Promise<string> {
		// Create temp file
		const [path, cleanup] = await createTemp();

		logger.info(`text file: Temp file is ${path}`);

		try {
			// write content at URL to temp file
			await downloadUrl(url, path);

			const text = await fs.promises.readFile(path, 'utf8');

			return text;
		} finally {
			cleanup();
		}
	}

	return { downloadUrl, downloadTextFile };
}

export type DownloadService = ReturnType<typeof createDownloadService>;
