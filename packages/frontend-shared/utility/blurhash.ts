/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const BLURHASH_BASE_SIZE = 64;
const BLURHASH_MAX_SIZE = 4096;

export function calculateBlurhashDimensions(width: number, height: number): {
	ratio: number;
	canvasWidth: number;
	canvasHeight: number;
} {
	const ratio = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
		? width / height
		: 1;
	const canvasWidth = ratio > 1 ? Math.round(BLURHASH_BASE_SIZE * ratio) : BLURHASH_BASE_SIZE;
	const canvasHeight = ratio > 1 ? BLURHASH_BASE_SIZE : Math.round(BLURHASH_BASE_SIZE / ratio);

	return {
		ratio,
		canvasWidth: Math.max(1, Math.min(BLURHASH_MAX_SIZE, canvasWidth)),
		canvasHeight: Math.max(1, Math.min(BLURHASH_MAX_SIZE, canvasHeight)),
	};
}
