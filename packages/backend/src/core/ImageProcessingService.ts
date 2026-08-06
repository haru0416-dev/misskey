/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import sharp from 'sharp';
import type { Sharp, WebpOptions, AvifOptions } from 'sharp';

export type IImage = {
	data: Buffer;
	ext: string | null;
	type: string;
};

export type IImageStream = {
	data: Readable;
	ext: string | null;
	type: string;
};

export type IImageSharp = {
	data: Sharp;
	ext: string | null;
	type: string;
};

export type IImageStreamable = IImage | IImageStream | IImageSharp;

export const webpDefault: WebpOptions = {
	quality: 77,
	alphaQuality: 95,
	lossless: false,
	nearLossless: false,
	smartSubsample: true,
	mixed: true,
	effort: 2,
	loop: 0,
};

export const avifDefault: AvifOptions = {
	quality: 60,
	lossless: false,
	effort: 2,
};

import { Readable } from 'node:stream';

export function createImageProcessingService() {
	/**
	 * Convert to WebP
	 *   with resize, remove metadata, resolve orientation, stop animation
	 */
	async function convertToWebp(
		path: string,
		width: number,
		height: number,
		options: WebpOptions = webpDefault,
	): Promise<IImage> {
		return convertSharpToWebp(sharp(path), width, height, options);
	}

	async function convertSharpToWebp(
		sharp: Sharp,
		width: number,
		height: number,
		options: WebpOptions = webpDefault,
	): Promise<IImage> {
		const result = convertSharpToWebpStream(sharp, width, height, options);

		return {
			data: await result.data.toBuffer(),
			ext: result.ext,
			type: result.type,
		};
	}

	function convertToWebpStream(
		path: string,
		width: number,
		height: number,
		options: WebpOptions = webpDefault,
	): IImageSharp {
		return convertSharpToWebpStream(sharp(path), width, height, options);
	}

	function convertSharpToWebpStream(
		sharp: Sharp,
		width: number,
		height: number,
		options: WebpOptions = webpDefault,
	): IImageSharp {
		const data = sharp
			.resize(width, height, {
				fit: 'inside',
				withoutEnlargement: true,
			})
			.rotate()
			.webp(options);

		return {
			data,
			ext: 'webp',
			type: 'image/webp',
		};
	}

	/**
	 * Convert to Avif
	 *   with resize, remove metadata, resolve orientation, stop animation
	 */
	async function convertToAvif(
		path: string,
		width: number,
		height: number,
		options: AvifOptions = avifDefault,
	): Promise<IImage> {
		return convertSharpToAvif(sharp(path), width, height, options);
	}

	async function convertSharpToAvif(
		sharp: Sharp,
		width: number,
		height: number,
		options: AvifOptions = avifDefault,
	): Promise<IImage> {
		const result = convertSharpToAvifStream(sharp, width, height, options);

		return {
			data: await result.data.toBuffer(),
			ext: result.ext,
			type: result.type,
		};
	}

	function convertToAvifStream(
		path: string,
		width: number,
		height: number,
		options: AvifOptions = avifDefault,
	): IImageSharp {
		return convertSharpToAvifStream(sharp(path), width, height, options);
	}

	function convertSharpToAvifStream(
		sharp: Sharp,
		width: number,
		height: number,
		options: AvifOptions = avifDefault,
	): IImageSharp {
		const data = sharp
			.resize(width, height, {
				fit: 'inside',
				withoutEnlargement: true,
			})
			.rotate()
			.avif(options);

		return {
			data,
			ext: 'avif',
			type: 'image/avif',
		};
	}

	/**
	 * Convert to PNG
	 *   with resize, remove metadata, resolve orientation, stop animation
	 */
	async function convertToPng(path: string, width: number, height: number): Promise<IImage> {
		return convertSharpToPng(sharp(path), width, height);
	}

	async function convertSharpToPng(sharp: Sharp, width: number, height: number): Promise<IImage> {
		const data = await sharp
			.resize(width, height, {
				fit: 'inside',
				withoutEnlargement: true,
			})
			.rotate()
			.png()
			.toBuffer();

		return {
			data,
			ext: 'png',
			type: 'image/png',
		};
	}

	return {
		convertToWebp,
		convertSharpToWebp,
		convertToWebpStream,
		convertSharpToWebpStream,
		convertToAvif,
		convertSharpToAvif,
		convertToAvifStream,
		convertSharpToAvifStream,
		convertToPng,
		convertSharpToPng,
	};
}

export type ImageProcessingService = ReturnType<typeof createImageProcessingService>;
