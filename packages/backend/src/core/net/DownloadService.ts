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
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import { createTemp } from '@/misc/create-temp.js';
import { StatusError } from '@/misc/status-error.js';
import type { LoggerService } from '@/core/LoggerService.js';

export function createDownloadService(
	config: Config,
	httpRequestService: HttpRequestService,
	loggerService: LoggerService,
) {
	const logger = loggerService.getLogger('download');

	/**
	 * 取得を始め、本文を上限つきで sink へ流す。タイムアウトと上限超過の扱いは全ての取得で共通。
	 */
	async function download(url: string, sink: stream.Writable): Promise<{ filename: string }> {
		const responseTimeout = 30 * 1000;
		const operationTimeout = 60 * 1000;
		const maxSize = config.limits.maximumFileSizeBytes;

		const urlObj = new URL(url);
		let filename = urlObj.pathname.split('/').pop() ?? 'untitled';

		const controller = new AbortController();
		const operationTimer = setTimeout(() => controller.abort(), operationTimeout);
		// レスポンスヘッダ受信までのタイムアウト (fetch 解決後に解除される)
		const responseTimer = setTimeout(() => controller.abort(), responseTimeout);

		try {
			const res = await httpRequestService
				.fetchFollowingRedirects(
					url,
					{
						method: 'GET',
						headers: {
							'User-Agent': config.runtime.userAgent,
						},
						body: undefined,
						signal: controller.signal,
					},
					false,
				)
				.finally(() => clearTimeout(responseTimer));

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
					if (parsed.parameters['filename']) {
						filename = parsed.parameters['filename'];
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

			const body =
				res.body != null
					? stream.Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
					: stream.Readable.from([]);
			await pipeline(body, limitSize, sink);
			return { filename };
		} finally {
			clearTimeout(operationTimer);
			clearTimeout(responseTimer);
		}
	}

	async function downloadUrl(
		url: string,
		path: string,
	): Promise<{
		filename: string;
	}> {
		logger.info(`Downloading ${chalk.cyan(url)} to ${chalk.cyanBright(path)} ...`);
		const { filename } = await download(url, fs.createWriteStream(path));
		logger.succ(`Download finished: ${chalk.cyan(url)}`);
		return { filename };
	}

	/**
	 * memoryLimitBytes までは一時ファイルを作らずメモリに受け取り、超えたら一時ファイルに切り替える。
	 * 一時ファイル経由はディスクへの書き込み (SD カードでは寿命) と、並行時に Bun の fs 処理待ちで遅れる。
	 */
	async function downloadUrlToMemoryOrFile(
		url: string,
		memoryLimitBytes: number,
	): Promise<{ filename: string } & ({ data: Buffer } | { path: string; cleanup: () => void })> {
		logger.info(`Downloading ${chalk.cyan(url)} ...`);
		const chunks: Buffer[] = [];
		let size = 0;
		const spill: { to: { path: string; cleanup: () => void; file: fs.WriteStream } | null } = { to: null };
		const sink = new stream.Writable({
			write(chunk: Buffer, _encoding, callback) {
				if (spill.to != null) {
					spill.to.file.write(chunk, callback);
					return;
				}
				chunks.push(chunk);
				size += chunk.length;
				if (size <= memoryLimitBytes) {
					callback();
					return;
				}
				createTemp().then(([path, cleanup]) => {
					const file = fs.createWriteStream(path);
					spill.to = { path, cleanup, file };
					for (const buffered of chunks.splice(0)) file.write(buffered);
					file.write(Buffer.alloc(0), callback);
				}, callback);
			},
			final(callback) {
				if (spill.to == null) {
					callback();
					return;
				}
				spill.to.file.end(callback);
			},
		});
		let filename: string;
		try {
			({ filename } = await download(url, sink));
		} catch (e) {
			spill.to?.file.destroy();
			spill.to?.cleanup();
			throw e;
		}
		const result =
			spill.to == null ? { data: Buffer.concat(chunks, size) } : { path: spill.to.path, cleanup: spill.to.cleanup };
		logger.succ(`Download finished: ${chalk.cyan(url)}`);
		return { filename, ...result };
	}

	/**
	 * リモートのファイルを保存せずに中継するため、応答を開いて本文をそのまま返す。
	 * Range・条件付き取得のヘッダは呼び出し元が渡し、206・304 もそのまま返す。
	 * 本文は全体の上限 (maximumFileSizeBytes) を超えたら止め、60 秒データが来なければ切る。
	 * 返した body を destroy すると取得も中断する。
	 */
	async function openRemoteStream(
		url: string,
		forwardHeaders: Record<string, string>,
	): Promise<{ status: number; headers: Headers; body: stream.Readable }> {
		const responseTimeout = 30 * 1000;
		const idleTimeout = 60 * 1000;
		const maxSize = config.limits.maximumFileSizeBytes;

		const controller = new AbortController();
		const responseTimer = setTimeout(() => controller.abort(), responseTimeout);
		const res = await httpRequestService
			.fetchFollowingRedirects(
				url,
				{
					method: 'GET',
					// 自動展開されると Content-Length・Content-Range が本文と合わなくなる。
					headers: { 'User-Agent': config.runtime.userAgent, 'Accept-Encoding': 'identity', ...forwardHeaders },
					body: undefined,
					signal: controller.signal,
				},
				false,
			)
			.finally(() => clearTimeout(responseTimer));

		if (!res.ok && res.status !== 304) {
			await res.body?.cancel().catch(() => {});
			throw new StatusError(`${res.status} ${res.statusText}`, res.status, res.statusText);
		}

		const contentLength = Number(res.headers.get('content-length') ?? Number.NaN);
		if (contentLength > maxSize) {
			await res.body?.cancel().catch(() => {});
			throw new StatusError(`Payload Too Large (${contentLength} > ${maxSize})`, 413, 'Payload Too Large');
		}

		let idleTimer = setTimeout(() => controller.abort(), idleTimeout);
		let transferred = 0;
		const limited = new stream.Transform({
			transform(chunk: Buffer, _encoding, callback) {
				clearTimeout(idleTimer);
				idleTimer = setTimeout(() => controller.abort(), idleTimeout);
				transferred += chunk.length;
				if (transferred > maxSize) {
					callback(new StatusError(`Payload Too Large (${transferred} > ${maxSize})`, 413, 'Payload Too Large'));
					return;
				}
				callback(null, chunk);
			},
		});
		const source =
			res.body != null
				? stream.Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
				: stream.Readable.from([]);
		stream.pipeline(source, limited, (err) => {
			clearTimeout(idleTimer);
			if (err) {
				controller.abort();
			}
		});

		return { status: res.status, headers: res.headers, body: limited };
	}

	async function downloadTextFile(url: string): Promise<string> {
		const [path, cleanup] = await createTemp();

		logger.info(`text file: Temp file is ${path}`);

		try {
			await downloadUrl(url, path);

			const text = await fs.promises.readFile(path, 'utf8');

			return text;
		} finally {
			cleanup();
		}
	}

	return { downloadUrl, downloadUrlToMemoryOrFile, openRemoteStream, downloadTextFile };
}

export type DownloadService = ReturnType<typeof createDownloadService>;
