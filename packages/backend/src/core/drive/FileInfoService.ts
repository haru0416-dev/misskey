/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { join } from 'node:path';
import * as stream from 'node:stream/promises';
import { FSWatcher } from 'chokidar';
import * as fileType from 'file-type';
import isSvg from 'is-svg';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import { encodeBlurhash } from '@/core/drive/blurhash-encode.js';
import { createTempDir } from '@/misc/create-temp.js';
import { ffprobe, spawnFfmpeg } from '@/misc/ffmpeg.js';
import { AiService } from '@/core/ai/AiService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import type { Prediction } from '@/core/ai/AiService.js';

export type FileInfo = {
	size: number;
	md5: string;
	type: {
		mime: string;
		ext: string | null;
	};
	width?: number | undefined;
	height?: number | undefined;
	orientation?: number | undefined;
	blurhash?: string | undefined;
	sensitive: boolean;
	porn: boolean;
	warnings: string[];
};

const TYPE_OCTET_STREAM = {
	mime: 'application/octet-stream',
	ext: null,
};

const TYPE_SVG = {
	mime: 'image/svg+xml',
	ext: 'svg',
};

function exists(path: string): Promise<boolean> {
	return fs.promises.access(path).then(
		() => true,
		() => false,
	);
}

/**
 * ビデオファイルにビデオトラックがあるかどうかチェック
 * （ない場合：m4a, webmなど）
 *
 * @param path ファイルパス
 * @returns ビデオトラックがあるかどうか（エラー発生時は常に`true`を返す）
 */
async function getFileSize(path: string): Promise<number> {
	return (await fs.promises.stat(path)).size;
}

async function calcHash(path: string): Promise<string> {
	const hash = crypto.createHash('md5').setEncoding('hex');
	await stream.pipeline(fs.createReadStream(path), hash);
	return hash.read();
}

/** 画像の寸法を判定する。 */
async function detectImageSize(
	path: string,
	mime: string,
): Promise<{
	width: number;
	height: number;
	wUnits: string;
	hUnits: string;
	orientation?: number | undefined;
}> {
	// sharp は PSD を読めないため、ヘッダ (26 bytes, big-endian) を直接パースする
	if (mime === 'image/vnd.adobe.photoshop') {
		const fd = await fs.promises.open(path, 'r');
		try {
			const header = Buffer.alloc(26);
			await fd.read(header, 0, 26, 0);
			if (header.toString('latin1', 0, 4) !== '8BPS') throw new Error('invalid PSD header');
			return {
				width: header.readUInt32BE(18),
				height: header.readUInt32BE(14),
				wUnits: 'px',
				hUnits: 'px',
			};
		} finally {
			await fd.close();
		}
	}

	// 寸法はヘッダから読むだけでデコードしないため、pixel 上限は外す (上限判定は呼び出し側で行う)
	const metadata = await (await sharpBmp(path, mime, { limitInputPixels: false })).metadata();
	if (metadata.width == null || metadata.height == null) throw new Error('cannot detect image dimensions');
	return {
		width: metadata.width,
		height: metadata.height,
		wUnits: 'px',
		hUnits: 'px',
		orientation: metadata.orientation,
	};
}

/** 画像の blurhash 文字列を計算する。 */
async function getBlurhash(path: string, type: string): Promise<string> {
	const sharp = await sharpBmp(path, type);
	const { data: buffer, info } = await sharp
		.raw()
		.ensureAlpha()
		.resize(64, 64, { fit: 'inside' })
		.toBuffer({ resolveWithObject: true });
	return encodeBlurhash(buffer, info.width, info.height, 5, 5);
}

async function checkSvg(path: string): Promise<boolean> {
	try {
		const size = await getFileSize(path);
		if (size > 1 * 1024 * 1024) return false;
		const buffer = await fs.promises.readFile(path);
		return isSvg(buffer.toString());
	} catch {
		return false;
	}
}

export function createFileInfoService(aiService: AiService, loggerService: LoggerService) {
	const logger = loggerService.getLogger('file-info');

	async function getFileInfo(
		path: string,
		opts: {
			fileName?: string | null;
			skipSensitiveDetection: boolean;
			sensitiveThreshold?: number;
			sensitiveThresholdForPorn?: number;
			enableSensitiveMediaDetectionForVideos?: boolean;
		},
	): Promise<FileInfo> {
		const warnings = [] as string[];

		const size = await getFileSize(path);
		const md5 = await calcHash(path);

		let type = await detectType(path);

		if (type.mime === TYPE_OCTET_STREAM.mime && opts.fileName != null) {
			const ext = opts.fileName.split('.').pop();
			if (ext === 'txt') {
				type = {
					mime: 'text/plain',
					ext: 'txt',
				};
			} else if (ext === 'csv') {
				type = {
					mime: 'text/csv',
					ext: 'csv',
				};
			} else if (ext === 'json') {
				type = {
					mime: 'application/json',
					ext: 'json',
				};
			}
		}

		let width: number | undefined;
		let height: number | undefined;
		let orientation: number | undefined;

		if (
			[
				'image/png',
				'image/gif',
				'image/jpeg',
				'image/webp',
				'image/avif',
				'image/apng',
				'image/bmp',
				'image/tiff',
				'image/svg+xml',
				'image/vnd.adobe.photoshop',
			].includes(type.mime)
		) {
			const imageSize = await detectImageSize(path, type.mime).catch((e) => {
				warnings.push(`detectImageSize failed: ${e}`);
				return undefined;
			});

			if (!imageSize) {
				warnings.push('cannot detect image dimensions');
				type = TYPE_OCTET_STREAM;
			} else if (imageSize.wUnits === 'px') {
				width = imageSize.width;
				height = imageSize.height;
				orientation = imageSize.orientation;

				if (imageSize.width > 16383 || imageSize.height > 16383) {
					warnings.push('image dimensions exceeds limits');
					type = TYPE_OCTET_STREAM;
				}
			} else {
				warnings.push(`unsupported unit type: ${imageSize.wUnits}`);
			}
		}

		let blurhash: string | undefined;

		if (
			['image/jpeg', 'image/gif', 'image/png', 'image/apng', 'image/webp', 'image/avif', 'image/svg+xml'].includes(
				type.mime,
			)
		) {
			blurhash = await getBlurhash(path, type.mime).catch((e) => {
				warnings.push(`getBlurhash failed: ${e}`);
				return undefined;
			});
		}

		let sensitive = false;
		let porn = false;

		if (!opts.skipSensitiveDetection) {
			await detectSensitivity(
				path,
				type.mime,
				opts.sensitiveThreshold ?? 0.5,
				opts.sensitiveThresholdForPorn ?? 0.75,
				opts.enableSensitiveMediaDetectionForVideos ?? false,
			).then(
				(value) => {
					[sensitive, porn] = value;
				},
				(error) => {
					warnings.push(`detectSensitivity failed: ${error}`);
				},
			);
		}

		return {
			size,
			md5,
			type,
			width,
			height,
			orientation,
			blurhash,
			sensitive,
			porn,
			warnings,
		};
	}

	async function detectSensitivity(
		source: string,
		mime: string,
		sensitiveThreshold: number,
		sensitiveThresholdForPorn: number,
		analyzeVideo: boolean,
	): Promise<[sensitive: boolean, porn: boolean]> {
		let sensitive = false;
		let porn = false;

		function judgePrediction(result: readonly Prediction[]): [sensitive: boolean, porn: boolean] {
			let sensitive = false;
			let porn = false;

			if ((result.find((x) => x.className === 'Sexy')?.probability ?? 0) > sensitiveThreshold) sensitive = true;
			if ((result.find((x) => x.className === 'Hentai')?.probability ?? 0) > sensitiveThreshold) sensitive = true;
			if ((result.find((x) => x.className === 'Porn')?.probability ?? 0) > sensitiveThreshold) sensitive = true;

			if ((result.find((x) => x.className === 'Porn')?.probability ?? 0) > sensitiveThresholdForPorn) porn = true;

			return [sensitive, porn];
		}

		if (analyzeVideo && (mime === 'image/apng' || mime.startsWith('video/'))) {
			const [outDir, disposeOutDir] = await createTempDir();
			try {
				const videoFilters = [
					'select=e=eq(pict_type\\,PICT_TYPE_I)', // I-Frame のみをフィルタする（VP9 とかはデコードしてみないとわからないっぽい）
					'blackframe=amount=0', // 暗いフレームの検出（暗さに関わらず全てのフレームで測定値を取る）
					// 暗部が 50% 以上のフレームは誤検知リスクが高いため、50% 未満に限定する。
					'metadata=mode=select:key=lavfi.blackframe.pblack:value=50:function=less',
					'scale=w=299:h=299',
				].join(',');
				const args = [
					'-skip_frame',
					'nokey', // 可能ならキーフレームのみを取得してほしいとする（そうなるとは限らない）
					'-lowres',
					'3', // 判定用途では原寸不要なため、デコーダへ 1/8 縮小を許可する。
					'-i',
					source,
					'-an',
					'-vf',
					videoFilters,
					'-f',
					'image2',
					'-vsync',
					'0', // 可変フレームレートにすることで穴埋めをさせない
					join(outDir, '%d.png'),
				];
				const frameBuffers: Buffer[] = [];
				let frameIndex = 0;
				let targetIndex = 0;
				let nextIndex = 1;
				for await (const path of asyncIterateFrames(outDir, args)) {
					try {
						const index = frameIndex++;
						if (index !== targetIndex) {
							continue;
						}
						targetIndex = nextIndex;
						nextIndex += index; // fibonacci sequence によってフレーム数制限を掛ける
						frameBuffers.push(await fs.promises.readFile(path));
					} finally {
						fs.promises.unlink(path);
					}
				}
				const predictions = await aiService.detectSensitiveMany(frameBuffers);
				const results = predictions.filter((x): x is Prediction[] => x != null).map((x) => judgePrediction(x));
				// 判定に成功したフレームが 0 件のとき（接続先未設定・通信失敗等）は、
				// Math.ceil(0) との比較が 0 >= 0 で真になり全動画がセンシティブ扱いになってしまうため、
				// 1 件以上判定できたときのみ集約する（失敗時は非センシティブ扱い: misskey-dev/misskey#16804）。
				if (results.length > 0) {
					sensitive = results.filter((x) => x[0]).length >= Math.ceil(results.length * sensitiveThreshold);
					porn = results.filter((x) => x[1]).length >= Math.ceil(results.length * sensitiveThresholdForPorn);
				}
			} finally {
				disposeOutDir();
			}
		} else if (isMimeImage(mime, 'sharp-convertible-image-with-bmp')) {
			/*
			 * 判定サービス側のデコーダが受け付ける PNG へ変換し、内部処理の最大サイズである
			 * 299×299 に事前縮小する。
			 */
			const png = await (
				await sharpBmp(source, mime)
			)
				.resize(299, 299, {
					withoutEnlargement: false,
				})
				.rotate()
				.flatten({ background: { r: 119, g: 119, b: 119 } }) // 透過部分を18%グレーで塗りつぶす
				.png()
				.toBuffer();
			const result = await aiService.detectSensitive(png);
			if (result) {
				[sensitive, porn] = judgePrediction(result);
			}
		}

		return [sensitive, porn];
	}

	async function* asyncIterateFrames(cwd: string, ffmpegArgs: string[]): AsyncGenerator<string, void> {
		const watcher = new FSWatcher({
			cwd,
		});
		let finished = false;
		const proc = spawnFfmpeg(ffmpegArgs);
		const procDone = new Promise<void>((resolve, reject) => {
			proc.on('error', reject);
			proc.on('close', (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`ffmpeg exited with code ${code}`));
				}
			});
		});
		procDone
			.catch(() => {})
			.finally(() => {
				finished = true;
				watcher.close();
			});
		for (let i = 1; true; i++) {
			const current = `${i}.png`;
			const next = `${i + 1}.png`;
			const framePath = join(cwd, current);
			if (await exists(join(cwd, next))) {
				yield framePath;
			} else if (!finished) {
				watcher.add(next);
				await new Promise<void>((resolve, reject) => {
					watcher.on('add', function onAdd(path) {
						if (path === next) {
							watcher.unwatch(current);
							watcher.off('add', onAdd);
							resolve();
						}
					});
					procDone.then(resolve, reject);
				});
				yield framePath;
			} else if (await exists(framePath)) {
				yield framePath;
			} else {
				return;
			}
		}
	}

	async function hasVideoTrackOnVideoFile(path: string): Promise<boolean> {
		const sublogger = logger.createSubLogger('ffprobe');
		sublogger.info(`Checking the video file. File path: ${path}`);
		try {
			const metadata = await ffprobe(path);
			return metadata.streams.some((stream) => stream.codec_type === 'video');
		} catch (err) {
			sublogger.warn(`Could not check the video file. Returns true. File path: ${path}`, err as Error);
			return true;
		}
	}

	/** MIME タイプと拡張子を判定する。 */
	async function detectType(path: string): Promise<{
		mime: string;
		ext: string | null;
	}> {
		const fileSize = await getFileSize(path);
		if (fileSize === 0) {
			return TYPE_OCTET_STREAM;
		}

		const type = await fileType.fileTypeFromFile(path);

		if (type) {
			if (type.mime === 'application/xml' && (await checkSvg(path))) {
				return TYPE_SVG;
			}

			if (
				(type.mime.startsWith('video') || type.mime === 'application/ogg') &&
				!(await hasVideoTrackOnVideoFile(path))
			) {
				const newMime = `audio/${type.mime.split('/')[1]}`;
				if (newMime === 'audio/mp4') {
					return {
						mime: 'audio/mp4',
						ext: 'm4a',
					};
				}
				return {
					mime: newMime,
					ext: type.ext,
				};
			}

			return {
				mime: type.mime,
				ext: type.ext,
			};
		}

		if (await checkSvg(path)) {
			return TYPE_SVG;
		}

		return TYPE_OCTET_STREAM;
	}

	return { getFileInfo, detectType, checkSvg, getFileSize };
}

export type FileInfoService = ReturnType<typeof createFileInfoService>;
