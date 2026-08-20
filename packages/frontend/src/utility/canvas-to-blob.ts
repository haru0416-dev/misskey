/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function canvasToBlob(canvas: HTMLCanvasElement, type?: string, quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob == null) {
					reject(new Error('Failed to convert canvas to blob'));
					return;
				}
				resolve(blob);
			},
			type,
			quality,
		);
	});
}

export async function renderCanvasToBlob(
	canvas: HTMLCanvasElement,
	render: () => Promise<void>,
	destroy: () => void,
	type?: string,
	quality?: number,
): Promise<Blob> {
	try {
		await render();
		return await canvasToBlob(canvas, type, quality);
	} finally {
		destroy();
	}
}
