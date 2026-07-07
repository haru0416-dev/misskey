/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as stream from 'node:stream/promises';
import chalk from 'chalk';
import got, * as Got from 'got';
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

		const timeout = 30 * 1000;
		const operationTimeout = 60 * 1000;
		const maxSize = config.maxFileSize;

		const urlObj = new URL(url);
		let filename = urlObj.pathname.split('/').pop() ?? 'untitled';

		const req = got.stream(url, {
			headers: {
				'User-Agent': config.userAgent,
			},
			timeout: {
				lookup: timeout,
				connect: timeout,
				secureConnect: timeout,
				socket: timeout,	// read timeout
				response: timeout,
				send: timeout,
				request: operationTimeout,	// whole operation timeout
			},
			agent: {
				http: httpRequestService.getAgentForHttp(urlObj, true),
				https: httpRequestService.getAgentForHttps(urlObj, true),
			},
			http2: false,	// default
			retry: {
				limit: 0,
			},
			enableUnixSockets: false,
		}).on('response', (res: Got.Response) => {
			const contentLength = res.headers['content-length'];
			if (contentLength != null) {
				const size = Number(contentLength);
				if (size > maxSize) {
					logger.warn(`maxSize exceeded (${size} > ${maxSize}) on response`);
					req.destroy();
				}
			}

			const contentDisposition = res.headers['content-disposition'];
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
		}).on('downloadProgress', (progress: Got.Progress) => {
			if (progress.transferred > maxSize) {
				logger.warn(`maxSize exceeded (${progress.transferred} > ${maxSize}) on downloadProgress`);
				req.destroy();
			}
		});

		try {
			await stream.pipeline(req, fs.createWriteStream(path));
		} catch (e) {
			if (e instanceof Got.HTTPError) {
				throw new StatusError(`${e.response.statusCode} ${e.response.statusMessage}`, e.response.statusCode, e.response.statusMessage);
			} else {
				throw e;
			}
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
