/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createAiService } from '@/core/AiService.js';
import type { AiService as AiServiceType, Prediction } from '@/core/AiService.js';
import type { MiMeta } from '@/models/_.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';

// AiService は HttpRequestService.send() 経由で外部サービスへ送信する (SSRF/proxy/size 制限は send 側に一元化)。
// send をモックして、送信内容とレスポンス解釈を検証する。
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

const DEFAULT_META = {
	sensitiveMediaDetectionApiUrl: 'http://localhost:3009' as string | null,
	sensitiveMediaDetectionApiKey: null as string | null,
	sensitiveMediaDetectionTimeout: 5000,
	sensitiveMediaDetectionMaxImagesPerRequest: 4,
};

function makeService(metaOverrides: Partial<typeof DEFAULT_META> = {}): AiServiceType {
	const meta = { ...DEFAULT_META, ...metaOverrides } as unknown as MiMeta;
	const httpRequestService = { send: sendMock } as unknown as HttpRequestService;
	const loggerService = {
		getLogger: () => ({ warn: () => {}, error: () => {}, info: () => {} }),
	} as unknown as LoggerService;
	return createAiService(meta, httpRequestService, loggerService);
}

function neutral(): Prediction[] {
	return [{ className: 'Neutral', probability: 0.99 }];
}

function okResponse(results: unknown[]) {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		json: async () => ({ success: true, result: { results } }),
	};
}

const buf = (s: string) => Buffer.from(s);

describe('AiService', () => {
	beforeEach(() => {
		sendMock.mockReset();
	});

	test('正常: 送信順を保った予測値配列を返す', async () => {
		sendMock.mockResolvedValue(okResponse([
			{ success: true, predictions: neutral() },
			{ success: true, predictions: [{ className: 'Porn', probability: 0.8 }] },
		]));
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res).toEqual([
			[{ className: 'Neutral', probability: 0.99 }],
			[{ className: 'Porn', probability: 0.8 }],
		]);
		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(sendMock.mock.calls[0][0]).toBe('http://localhost:3009/v1/detect-images');
	});

	test('外部サービス: SSRF/proxy 制限を素通ししない (isLocalAddressAllowed を立てない)', async () => {
		sendMock.mockResolvedValue(okResponse([{ success: true, predictions: neutral() }]));
		const svc = makeService({ sensitiveMediaDetectionApiUrl: 'https://detector.example.com' });

		await svc.detectSensitiveMany([buf('a')]);

		const args = sendMock.mock.calls[0][1] as { isLocalAddressAllowed?: boolean; body: unknown };
		expect(args.isLocalAddressAllowed).toBeUndefined();
		expect(args.body).toBeInstanceOf(FormData);
	});

	test('detectSensitive: 単一画像はバッチの先頭を返す', async () => {
		sendMock.mockResolvedValue(okResponse([{ success: true, predictions: neutral() }]));
		const svc = makeService();
		const res = await svc.detectSensitive(buf('a'));
		expect(res).toEqual(neutral());
	});

	test('部分失敗: 失敗パーツのみ null になる', async () => {
		sendMock.mockResolvedValue(okResponse([
			{ success: true, predictions: neutral() },
			{ success: false, error: { code: 'IMAGE_DECODE_FAILED', message: 'x' } },
		]));
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res[0]).toEqual(neutral());
		expect(res[1]).toBeNull();
	});

	test('非200: チャンク全件 null（例外を投げない）', async () => {
		sendMock.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) });
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res).toEqual([null, null]);
	});

	test('通信エラー: チャンク全件 null（例外を投げない）', async () => {
		sendMock.mockRejectedValue(new Error('network down'));
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a')]);
		expect(res).toEqual([null]);
	});

	test('接続先未設定: HTTP を叩かず全件 null', async () => {
		const svc = makeService({ sensitiveMediaDetectionApiUrl: null });
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res).toEqual([null, null]);
		expect(sendMock).not.toHaveBeenCalled();
	});

	test('チャンク分割: maxImagesPerRequest ごとに順次送信する', async () => {
		sendMock.mockResolvedValue(okResponse([
			{ success: true, predictions: neutral() },
			{ success: true, predictions: neutral() },
			{ success: true, predictions: neutral() },
			{ success: true, predictions: neutral() },
		]));
		const svc = makeService({ sensitiveMediaDetectionMaxImagesPerRequest: 2 });
		const res = await svc.detectSensitiveMany([buf('a'), buf('b'), buf('c'), buf('d'), buf('e')]);
		// 5 枚を 2 枚ずつ → 3 リクエスト、結果は順序を保って 5 件。
		expect(sendMock).toHaveBeenCalledTimes(3);
		expect(res).toHaveLength(5);
		expect(res.every(x => x != null)).toBe(true);
	});

	test('APIキー設定時のみ Authorization: Bearer を付与する', async () => {
		sendMock.mockResolvedValue(okResponse([{ success: true, predictions: neutral() }]));

		const withKey = makeService({ sensitiveMediaDetectionApiKey: 'secret' });
		await withKey.detectSensitiveMany([buf('a')]);
		expect((sendMock.mock.calls[0][1] as any).headers.Authorization).toBe('Bearer secret');

		const withoutKey = makeService();
		await withoutKey.detectSensitiveMany([buf('a')]);
		expect((sendMock.mock.calls[1][1] as any).headers.Authorization).toBeUndefined();
	});
});
