/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export { default as isAnimated } from 'is-file-animated';

export type ImageCompressionConfig = {
	maxWidth: number;
	maxHeight: number;
	mimeType: 'image/webp' | 'image/jpeg';
	quality: number;
};

/**
 * 拡大はせず、maxWidth と maxHeight の両方に収まる最大の寸法を返す。
 */
export function calculateTargetSize(
	sourceWidth: number,
	sourceHeight: number,
	config: Pick<ImageCompressionConfig, 'maxWidth' | 'maxHeight'>,
): { width: number; height: number } {
	const ratio = sourceWidth / sourceHeight;
	// 極端に細長い画像だと floor で 0 になり、OffscreenCanvas の生成が失敗する。
	const width = Math.max(1, Math.floor(Math.min(sourceWidth, config.maxWidth, ratio * config.maxHeight)));
	// 高さは丸めた後の幅から導く。丸める前の値から導くと、返す2辺の比が互いにずれる。
	// 幅を1へ引き上げた場合は高さが上限を超えうるので、ここで抑える。
	const height = Math.max(1, Math.min(Math.floor(sourceHeight * (width / sourceWidth)), config.maxHeight));
	return { width, height };
}

/**
 * 画像を指定の寸法に収まるまで縮小し、再エンコードして返す。
 *
 * 縮小は `createImageBitmap` の resize に任せる。`resizeQuality` の既定は 'low' なので
 * 明示が要る。canvas の `drawImage` で縮める道もあるが、品質の指定手段である
 * `imageSmoothingQuality` を Firefox が実装していないため、そちらへ寄せると Firefox だけ
 * 品質が落ちる (実測: 4032x3024 → 1125px で 43.8dB → 39.3dB)。
 *
 * `resizeQuality` を実装していない環境 (Firefox 149 未満) では既定の 'low' で縮小される。
 * 寸法は正しく出るが品質は上がらない。
 */
export async function readAndCompressImage(file: Blob, config: ImageCompressionConfig): Promise<Blob> {
	const source = await createImageBitmap(file);
	let scaled: ImageBitmap | null = null;
	try {
		const target = calculateTargetSize(source.width, source.height, config);
		if (target.width < source.width) {
			scaled = await createImageBitmap(source, {
				resizeWidth: target.width,
				resizeHeight: target.height,
				resizeQuality: 'high',
			});
		}
		const bitmap = scaled ?? source;

		// canvas は常に縮小後の寸法で作る。原寸で作ると iOS WebKit の 16,777,216px 制限に掛かる。
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const ctx = canvas.getContext('2d');
		if (ctx == null) throw new Error('image-compression: failed to get a 2d context');
		ctx.drawImage(bitmap, 0, 0);

		return await canvas.convertToBlob({ type: config.mimeType, quality: config.quality });
	} finally {
		scaled?.close();
		source.close();
	}
}
