/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { HttpRequestService } from '@/core/HttpRequestService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { MiMeta } from '@/models/_.js';

/**
 * 正規化済み画像に対する nsfwjs 互換の予測値。
 * 推論自体は外部サービス (sensitive-detector) が行い、本体はその生の値を受け取って判定する。
 */
export type Prediction = {
	className: string;
	probability: number;
};

type BatchItemResult =
	| { success: true; predictions: Prediction[] }
	| { success: false; error: { code: string; message: string } };

type DetectImagesResponse =
	| { success: true; result: { results: BatchItemResult[] } }
	| { success: false; error: { code: string; message: string } };

function isPrediction(v: unknown): v is Prediction {
	if (typeof v !== 'object' || v === null) return false;
	const obj = v as Record<string, unknown>;
	return typeof obj['className'] === 'string' && typeof obj['probability'] === 'number';
}

function isBatchItemResult(v: unknown): v is BatchItemResult {
	if (typeof v !== 'object' || v === null) return false;
	const obj = v as Record<string, unknown>;
	if (obj['success'] === true) {
		return Array.isArray(obj['predictions']) && (obj['predictions'] as unknown[]).every(isPrediction);
	}
	if (obj['success'] === false) {
		const error = obj['error'];
		return (
			typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>)['code'] === 'string'
		);
	}
	return false;
}

function isDetectImagesResponse(v: unknown): v is DetectImagesResponse {
	if (typeof v !== 'object' || v === null) return false;
	const obj = v as Record<string, unknown>;
	if (obj['success'] === true) {
		const result = obj['result'];
		if (typeof result !== 'object' || result === null) return false;
		const results = (result as Record<string, unknown>)['results'];
		return Array.isArray(results) && (results as unknown[]).every(isBatchItemResult);
	}
	if (obj['success'] === false) {
		const error = obj['error'];
		return (
			typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>)['code'] === 'string'
		);
	}
	return false;
}

// サイドカーの判定エンドポイント。baseUrl にパスプレフィックスがあっても連結できるよう先頭スラッシュは付けない。
const DETECT_IMAGES_PATH = 'v1/detect-images';

export function createAiService(meta: MiMeta, httpRequestService: HttpRequestService, loggerService: LoggerService) {
	const logger = loggerService.getLogger('ai');

	/**
	 * 正規化済み画像 1 枚を外部サービスに送り、生の予測値を得る。
	 * 接続先未設定・通信失敗・タイムアウト時は null（= 非センシティブ扱い）を返す。
	 */
	async function detectSensitive(source: Buffer): Promise<Prediction[] | null> {
		return (await detectSensitiveMany([source]))[0] ?? null;
	}

	/**
	 * 複数の正規化済み画像をまとめて外部サービスに送る。
	 * maxImagesPerRequest 枚ごとにチャンク分割して順次送信し、送信順を保った結果配列を返す。
	 * 接続先未設定・通信失敗・タイムアウト時は該当分を null（= 非センシティブ扱い）にしてフォールバックする
	 * （API 呼び出し失敗時はセンシティブではない判定とする方針: misskey-dev/misskey#16804）。
	 */
	async function detectSensitiveMany(sources: Buffer[]): Promise<(Prediction[] | null)[]> {
		if (sources.length === 0) return [];

		const baseUrl = meta.sensitiveMediaDetectionApiUrl;
		if (baseUrl == null || baseUrl.trim() === '') {
			// 接続先が未設定なら検出不能。全件 null（非センシティブ扱い）を返す。
			return sources.map(() => null);
		}

		const apiKey = meta.sensitiveMediaDetectionApiKey;
		const timeout = meta.sensitiveMediaDetectionTimeout;
		const chunkSize = Math.max(1, meta.sensitiveMediaDetectionMaxImagesPerRequest);

		const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
		let url: string;
		try {
			url = new URL(DETECT_IMAGES_PATH, base).href;
		} catch {
			logger.warn(`invalid sensitiveMediaDetectionApiUrl: ${baseUrl}`);
			return sources.map(() => null);
		}

		const results: (Prediction[] | null)[] = [];
		for (let i = 0; i < sources.length; i += chunkSize) {
			const chunk = sources.slice(i, i + chunkSize);
			results.push(...(await detectChunk(url, apiKey, timeout, chunk)));
		}
		return results;
	}

	async function detectChunk(
		url: string,
		apiKey: string | null,
		timeout: number,
		chunk: Buffer[],
	): Promise<(Prediction[] | null)[]> {
		try {
			const form = new FormData();
			for (const [i, source] of chunk.entries()) {
				const image = Uint8Array.from(source);
				form.append(`image${i}`, new Blob([image], { type: 'image/png' }), `${i}.png`);
			}

			// Content-Type は FormData から boundary 付きで自動設定させるため、手動設定はしない。
			// 手動指定すると boundary の欠落・不一致で multipart として読めなくなる。
			const headers: Record<string, string> = {};
			if (apiKey != null && apiKey !== '') {
				headers['Authorization'] = `Bearer ${apiKey}`;
			}

			// 外部サービスとして通常の proxy / private address 制限を HttpRequestService.send 側で適用する。
			// サイドカーへの private network 接続は allowedPrivateNetworks 等で明示的に許可する。
			const res = await httpRequestService.send(
				url,
				{
					method: 'POST',
					headers,
					body: form,
					timeout,
				},
				{ throwErrorWhenResponseNotOk: false },
			);

			if (!res.ok) {
				logger.warn(`sensitive detection request failed: ${res.status} ${res.statusText}`);
				return chunk.map(() => null);
			}

			const body = await res.json();
			if (!isDetectImagesResponse(body)) {
				logger.warn(`sensitive detection responded with unexpected shape: ${JSON.stringify(body)}`);
				return chunk.map(() => null);
			}
			if (!body.success) {
				logger.warn(`sensitive detection responded with failure: ${body.error.code}`);
				return chunk.map(() => null);
			}

			const items = body.result.results;
			return chunk.map((_, i) => {
				const item = items[i];
				return item?.success ? item.predictions : null;
			});
		} catch (err) {
			logger.warn(`sensitive detection error: ${err instanceof Error ? err.message : String(err)}`);
			return chunk.map(() => null);
		}
	}

	return { detectSensitive, detectSensitiveMany };
}

export type AiService = ReturnType<typeof createAiService>;
