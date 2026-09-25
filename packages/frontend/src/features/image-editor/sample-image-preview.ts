/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import * as os from '@/os.js';

export type SampleImageType = '3_2' | '2_3' | 'provided';

type SampleImagePreviewSource =
	| { type: '3_2' | '2_3'; image: HTMLImageElement }
	| { type: 'provided'; file: File; bitmap: ImageBitmap };

type PreviewRenderer = {
	destroy(disposeCanvas?: boolean): void;
};

function loadSampleImage(src: string) {
	const image = new Image();
	image.src = src;
	const loading = new Promise<void>((resolve) => {
		image.onload = () => resolve();
	});
	return { image, loading };
}

// 透かし・フレームのプリセット編集で、見本画像と利用者が選んだ画像を切り替えながらプレビューする。
// 見本画像の切替時は canvas を使い回すため destroy(false) で WebGL コンテキストを残す。
export function useSampleImagePreview<R extends PreviewRenderer>(options: {
	canvasEl: Readonly<Ref<HTMLCanvasElement | null>>;
	image: File | null | undefined;
	createRenderer: (canvas: HTMLCanvasElement, source: SampleImagePreviewSource) => R | Promise<R>;
	render: (renderer: R) => Promise<void>;
	failedToLoadImageText: string;
}) {
	const sample_3_2 = loadSampleImage('/client-assets/sample/3-2.jpg');
	const sample_2_3 = loadSampleImage('/client-assets/sample/2-3.jpg');

	const sampleImageType = ref<SampleImageType>(options.image != null ? 'provided' : '3_2');
	let imageFile = options.image;
	let renderer: R | null = null;
	let imageBitmap: ImageBitmap | null = null;

	async function initRenderer() {
		const canvas = options.canvasEl.value;
		if (canvas == null) {
			return;
		}

		if (sampleImageType.value === '3_2') {
			renderer = await options.createRenderer(canvas, { type: '3_2', image: sample_3_2.image });
		} else if (sampleImageType.value === '2_3') {
			renderer = await options.createRenderer(canvas, { type: '2_3', image: sample_2_3.image });
		} else if (imageFile != null) {
			imageBitmap = await window.createImageBitmap(imageFile);
			renderer = await options.createRenderer(canvas, { type: 'provided', file: imageFile, bitmap: imageBitmap });
		}

		await options.render(renderer!);
	}

	function reinitRenderer() {
		if (renderer != null) {
			renderer.destroy(false);
			renderer = null;
			initRenderer();
		}
	}

	watch(sampleImageType, () => {
		if (sampleImageType.value === 'provided') {
			return;
		}
		reinitRenderer();
	});

	async function chooseImage() {
		const files = await os.chooseFileFromPc({ multiple: false });
		if (files.length === 0) {
			return;
		}
		imageFile = files[0];
		sampleImageType.value = 'provided';
		reinitRenderer();
	}

	function destroyRenderer() {
		if (renderer != null) {
			renderer.destroy();
			renderer = null;
		}
	}

	onMounted(async () => {
		const closeWaiting = os.waiting();

		await nextTick(); // waitingがレンダリングされるまで待つ

		await sample_3_2.loading;
		await sample_2_3.loading;

		try {
			await initRenderer();
		} catch (err) {
			console.error(err);
			os.alert({
				type: 'error',
				text: options.failedToLoadImageText,
			});
		}

		closeWaiting();
	});

	onUnmounted(() => {
		destroyRenderer();
		if (imageBitmap != null) {
			imageBitmap.close();
			imageBitmap = null;
		}
	});

	return {
		sampleImageType,
		chooseImage,
		getRenderer: () => renderer,
		destroyRenderer,
	};
}
